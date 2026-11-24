import {
  EAQI,
  SNAPSHOT_KEYS,
  classify,
  type AggregatedSeries,
  type HistorySnapshot,
  type HourlySeries,
  type RecentSnapshot,
  type StatusSnapshot,
} from "@aviles/core";
import { dailyStats, measurements, snapshots, stations, stationStatus, type DB } from "@aviles/db";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { officialDay } from "./daily.ts";

/**
 * Resúmenes para la web. Se recalculan en la ingesta y la API los sirve tal cual (1 fila por petición).
 *   - status:            cada hora
 *   - recent:<estación>: cada hora, solo estaciones con datos nuevos
 *   - history:<estación>: una vez al día (es la consulta más pesada)
 */
const RECENT_DAYS = 14;
const DAILY_DAYS = 366;
const HISTORY_REFRESH_MS = 20 * 3600_000;

const sec = (d: Date) => Math.floor(d.getTime() / 1000);

async function save(db: DB, key: string, value: unknown): Promise<void> {
  const row = { key, json: JSON.stringify(value), updatedAt: new Date() };
  await db
    .insert(snapshots)
    .values(row)
    .onConflictDoUpdate({ target: snapshots.key, set: { json: row.json, updatedAt: row.updatedAt } });
}

/** Estado actual de todas las estaciones con datos en las últimas 48 h */
export async function buildStatus(db: DB): Promise<StatusSnapshot> {
  const since = new Date(Date.now() - 48 * 3600_000);

  const base = await db
    .select({
      id: stations.id,
      name: stations.name,
      meta: stations.meta,
      lat: stations.lat,
      lon: stations.lon,
      level: stationStatus.level,
      metric: stationStatus.metric,
      value: stationStatus.value,
      unit: stationStatus.unit,
      observedAt: stationStatus.observedAt,
    })
    .from(stationStatus)
    .innerJoin(stations, eq(stationStatus.stationId, stations.id))
    .where(gte(stationStatus.observedAt, since));

  // Último valor de cada contaminante por estación (subconsulta con MAX: lee solo lo necesario)
  const latest = await db.all<{ station_id: string; metric: string; value: number; unit: string; t: number }>(sql`
    SELECT m.station_id, m.metric, m.value, m.unit, m.observed_at AS t
    FROM measurements m
    JOIN (
      SELECT station_id, metric, max(observed_at) AS t
      FROM measurements WHERE observed_at >= ${sec(since)}
      GROUP BY station_id, metric
    ) last ON last.station_id = m.station_id AND last.metric = m.metric AND last.t = m.observed_at
  `);

  const latestByStation = new Map<string, StatusSnapshot["stations"][number]["latest"]>();
  for (const r of latest) {
    const map = latestByStation.get(r.station_id) ?? {};
    map[r.metric] = { value: r.value, unit: r.unit, level: classify(EAQI, r.metric, r.value), t: r.t };
    latestByStation.set(r.station_id, map);
  }

  const snapshot: StatusSnapshot = {
    generatedAt: sec(new Date()),
    stations: base.map((s) => ({
      id: s.id,
      name: s.name,
      zone: String(s.meta?.zone ?? ""),
      zoneName: String(s.meta?.zoneName ?? "Otras"),
      lat: s.lat,
      lon: s.lon,
      level: s.level,
      metric: s.metric,
      value: s.value,
      unit: s.unit,
      t: sec(s.observedAt),
      latest: latestByStation.get(s.id) ?? {},
    })),
  };
  await save(db, SNAPSHOT_KEYS.status, snapshot);
  return snapshot;
}

/** Últimos 14 días de datos horarios de las estaciones indicadas */
export async function buildRecent(db: DB, stationIds: string[]): Promise<void> {
  if (!stationIds.length) return;
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 3600_000);
  const rows = await db
    .select({
      stationId: measurements.stationId,
      metric: measurements.metric,
      value: measurements.value,
      unit: measurements.unit,
      observedAt: measurements.observedAt,
    })
    .from(measurements)
    .where(and(inArray(measurements.stationId, stationIds), gte(measurements.observedAt, since)))
    .orderBy(asc(measurements.observedAt));

  const byStation = new Map<string, Record<string, HourlySeries>>();
  for (const r of rows) {
    const series = byStation.get(r.stationId) ?? {};
    const s = (series[r.metric] ??= { unit: r.unit, t: [], v: [] });
    s.t.push(sec(r.observedAt));
    s.v.push(r.value);
    byStation.set(r.stationId, series);
  }

  for (const id of stationIds) {
    const snapshot: RecentSnapshot = { stationId: id, generatedAt: sec(new Date()), series: byStation.get(id) ?? {} };
    await save(db, SNAPSHOT_KEYS.recent(id), snapshot);
  }
}

/** Último año en medias diarias y todo el histórico en medias mensuales, de todas las estaciones */
export async function buildHistory(db: DB): Promise<number> {
  const fromDay = officialDay(new Date(Date.now() - DAILY_DAYS * 24 * 3600_000));

  const daily = await db
    .select()
    .from(dailyStats)
    .where(gte(dailyStats.day, fromDay))
    .orderBy(asc(dailyStats.day));

  // Media mensual ponderada por horas (un día con 6 horas de datos pesa menos que uno completo)
  const monthly = await db.all<{ station_id: string; metric: string; month: string; mean: number; max: number; unit: string }>(sql`
    SELECT station_id, metric, substr(day, 1, 7) AS month,
           round(sum(mean * hours) / sum(hours), 2) AS mean,
           max(max) AS max, max(unit) AS unit
    FROM daily_stats
    GROUP BY station_id, metric, month
    ORDER BY month
  `);

  const result = new Map<string, HistorySnapshot>();
  const get = (id: string) => {
    let h = result.get(id);
    if (!h) result.set(id, (h = { stationId: id, generatedAt: sec(new Date()), daily: {}, monthly: {} }));
    return h;
  };
  const push = (target: Record<string, AggregatedSeries>, metric: string, unit: string, label: string, mean: number, max: number) => {
    const s = (target[metric] ??= { unit, labels: [], mean: [], max: [] });
    s.labels.push(label);
    s.mean.push(mean);
    s.max.push(max);
  };

  for (const r of daily) push(get(r.stationId).daily, r.metric, r.unit, r.day, r.mean, r.max);
  for (const r of monthly) push(get(r.station_id).monthly, r.metric, r.unit, r.month, r.mean, r.max);

  for (const [id, snapshot] of result) await save(db, SNAPSHOT_KEYS.history(id), snapshot);
  await save(db, SNAPSHOT_KEYS.historyBuiltAt, { at: sec(new Date()) });
  return result.size;
}

/** ¿Hace falta recalcular el histórico? (una vez al día) */
export async function historyIsStale(db: DB): Promise<boolean> {
  const [row] = await db.select().from(snapshots).where(eq(snapshots.key, SNAPSHOT_KEYS.historyBuiltAt));
  return !row || Date.now() - row.updatedAt.getTime() > HISTORY_REFRESH_MS;
}

/** Recalcula los resúmenes tras una pasada de ingesta */
export async function refreshSnapshots(db: DB, stationsWithNewData: string[], opts: { forceHistory?: boolean } = {}) {
  await buildStatus(db);
  await buildRecent(db, stationsWithNewData);
  if (opts.forceHistory || (await historyIsStale(db))) {
    const n = await buildHistory(db);
    // Una vez al día, borrar datos horarios de hace más de 400 días: el histórico largo vive en daily_stats
    const cutoff = sec(new Date(Date.now() - 400 * 24 * 3600_000));
    await db.run(sql`DELETE FROM measurements WHERE observed_at < ${cutoff}`);
    console.log(`[snapshots] Histórico recalculado para ${n} estaciones`);
  }
}
