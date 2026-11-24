import type { Alert, Measurement, Registry, Station } from "@aviles/core";
import { db, stations, measurements, subscriptions, alertsLog, writeTransaction } from "@aviles/db";
import { desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { evaluateStation } from "./episodes.ts";

/** Filas por sentencia INSERT (7 columnas × 200 = 1.400 parámetros, muy por debajo del límite de SQLite) */
const INSERT_CHUNK = 200;

/** Ejecuta un ciclo completo: estaciones → medidas → episodios → avisos. */
export async function runIngest(registry: Registry): Promise<void> {
  for (const source of registry.sources.values()) {
    const started = Date.now();

    // 1. Sincronizar estaciones (una sola sentencia)
    const sourceStations = await source.stations();
    if (sourceStations.length) {
      await db
        .insert(stations)
        .values(sourceStations)
        .onConflictDoUpdate({
          target: stations.id,
          set: {
            name: sql`excluded.name`,
            lat: sql`excluded.lat`,
            lon: sql`excluded.lon`,
            meta: sql`excluded.meta`,
          },
        });
    }
    const stationById = new Map(sourceStations.map((s) => [s.id, s]));

    // 2. Pedir datos recientes
    const since = await lastObservedAt(sourceStations.map((s) => s.id));
    const fetched = (await source.fetch(since)).filter((m) => stationById.has(m.stationId));

    // 3. Guardar en bloques de varias filas dentro de una transacción.
    //    Los duplicados se ignoran por el índice único y RETURNING devuelve solo las filas nuevas.
    //    Con Turso cada sentencia es un viaje de red: ~50 sentencias en vez de miles.
    const inserted: Measurement[] = [];
    await writeTransaction(async (tx) => {
      for (let i = 0; i < fetched.length; i += INSERT_CHUNK) {
        const rows = await tx
          .insert(measurements)
          .values(fetched.slice(i, i + INSERT_CHUNK))
          .onConflictDoNothing()
          .returning({
            stationId: measurements.stationId,
            metric: measurements.metric,
            value: measurements.value,
            unit: measurements.unit,
            observedAt: measurements.observedAt,
            provisional: measurements.provisional,
          });
        inserted.push(...rows);
      }
    });

    // 4. Episodios por estación, solo si la fuente tiene índice
    let alertCount = 0;
    if (source.index) {
      const hoursByStation = new Map<string, Date[]>();
      for (const m of inserted) {
        hoursByStation.set(m.stationId, [...(hoursByStation.get(m.stationId) ?? []), m.observedAt]);
      }
      for (const [stationId, hours] of hoursByStation) {
        const alerts = await evaluateStation(stationId, source.index, hours);
        for (const alert of alerts) {
          alertCount++;
          await dispatch(registry, alert, stationById.get(stationId)!);
        }
      }
    }

    console.log(
      `[${source.id}] ${fetched.length} leídas, ${inserted.length} nuevas, ${alertCount} avisos (${Date.now() - started} ms)`,
    );
  }
}

async function lastObservedAt(stationIds: string[]): Promise<Date | undefined> {
  if (!stationIds.length) return undefined;
  const [row] = await db
    .select({ observedAt: measurements.observedAt })
    .from(measurements)
    .where(inArray(measurements.stationId, stationIds))
    .orderBy(desc(measurements.observedAt))
    .limit(1);
  return row?.observedAt;
}

/** Envía el aviso por cada canal a quien esté suscrito a esa estación (o a todas). */
async function dispatch(registry: Registry, alert: Alert, station: Station): Promise<void> {
  const subs = await db
    .select()
    .from(subscriptions)
    .where(or(isNull(subscriptions.stationId), eq(subscriptions.stationId, alert.stationId)));

  let total = 0;
  for (const notifier of registry.notifiers.values()) {
    const recipients = [...new Set(subs.filter((s) => s.channel === notifier.id).map((s) => s.recipient))];
    // El de consola siempre imprime; el resto solo si hay suscriptores
    if (notifier.id !== "console" && recipients.length === 0) continue;
    total += recipients.length;
    try {
      await notifier.send(alert, recipients, station);
    } catch (err) {
      console.error(`[notifier:${notifier.id}]`, (err as Error).message);
    }
  }

  await db.insert(alertsLog).values({
    kind: alert.kind,
    stationId: alert.stationId,
    level: alert.level,
    metric: alert.metric,
    value: alert.value,
    observedAt: alert.observedAt,
    recipients: total,
  });
}
