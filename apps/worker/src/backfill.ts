/**
 * Carga histórica. Se ejecuta una vez (y se puede repetir sin duplicar nada).
 *
 *   1. Años anteriores (por defecto desde 2015): datos VERIFICADOS de la EEA → solo medias diarias.
 *   2. Año en curso: datos horarios provisionales de la EEA (UTD) → medidas horarias + medias diarias.
 *
 * Contra Turso, desde CMD:
 *   set DATABASE_URL=libsql://...
 *   set DATABASE_AUTH_TOKEN=...
 *   npm run backfill
 *
 * Opciones:  --desde=2018   --solo-historia   --solo-actual
 *
 * Si se corta, vuelve a lanzarlo: los ficheros de años anteriores ya procesados se saltan
 * (se apuntan en data/backfill-progress.json) y el resto se reescribe sin duplicar.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT_DIR, loadEnv } from "@aviles/core/env";
import { db, dailyStats, measurements, stations, isLocalFile, databaseUrl } from "@aviles/db";
import {
  Dataset,
  STATIONS,
  STATION_BY_CODE,
  asturiasUrls,
  mapLimit,
  mapRow,
  parquetUrls,
  readParquet,
  stationCodeFromSamplingPoint,
} from "@aviles/source-eea-air";
import type { Measurement } from "@aviles/core";
import { sql } from "drizzle-orm";
import { DailyAccumulator, officialDay, refreshDailyStats, type DailyRow } from "./daily.ts";
import { refreshSnapshots } from "./snapshots.ts";

loadEnv();

const args = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}`))?.split("=")[1];
const FROM_YEAR = Number(arg("desde") ?? 2015);
const ONLY_HISTORY = args.includes("--solo-historia");
const ONLY_CURRENT = args.includes("--solo-actual");
const CURRENT_YEAR = Number(officialDay(new Date()).slice(0, 4));

const CHUNK = 200;
const PROGRESS_FILE = path.join(ROOT_DIR, "data", "backfill-progress.json");

const fmt = (n: number) => n.toLocaleString("es-ES");
const target = isLocalFile ? "BD local (data/aviles.db)" : `Turso (${databaseUrl().replace(/^libsql:\/\//, "").split(".")[0]})`;

// ── Utilidades ───────────────────────────────────────────────────────────────

function loadProgress(): Set<string> {
  try {
    return new Set(JSON.parse(readFileSync(PROGRESS_FILE, "utf8")).done as string[]);
  } catch {
    return new Set();
  }
}

function saveProgress(done: Set<string>): void {
  mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  writeFileSync(PROGRESS_FILE, JSON.stringify({ done: [...done] }, null, 1));
}

async function upsertDaily(rows: DailyRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(dailyStats)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [dailyStats.stationId, dailyStats.metric, dailyStats.day],
        set: {
          mean: sql`excluded.mean`,
          max: sql`excluded.max`,
          hours: sql`excluded.hours`,
          unit: sql`excluded.unit`,
        },
      });
  }
}

async function insertHourly(rows: Measurement[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await db
      .insert(measurements)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing()
      .returning({ id: measurements.id });
    inserted += res.length;
  }
  return inserted;
}

// ── 1. Histórico verificado → medias diarias ────────────────────────────────

async function loadHistory(): Promise<void> {
  const lastYear = CURRENT_YEAR - 1;
  if (FROM_YEAR > lastYear) return;
  console.log(`\n## Histórico verificado ${FROM_YEAR}–${lastYear} (medias diarias)`);

  // Pedimos año a año y unimos: un mismo fichero puede aparecer en varios años
  const urls = new Map<string, string>(); // url → código de estación
  for (let year = FROM_YEAR; year <= lastYear; year++) {
    try {
      const list = await parquetUrls({
        countries: ["ES"],
        dataset: Dataset.Verified,
        dateTimeStart: `${year}-01-01T00:00:00Z`,
        dateTimeEnd: `${year}-12-31T23:59:59Z`,
        aggregationType: "hour",
      });
      let n = 0;
      for (const url of list) {
        const code = stationCodeFromSamplingPoint(url);
        if (code && STATION_BY_CODE.has(code)) {
          if (!urls.has(url)) n++;
          urls.set(url, code);
        }
      }
      console.log(`  ${year}: ${n} ficheros nuevos de estaciones de Asturias`);
    } catch (err) {
      console.error(`  ${year}: error al pedir la lista (${(err as Error).message})`);
    }
  }

  const done = loadProgress();
  const pending = [...urls].filter(([url]) => !done.has(url));
  console.log(`  ${fmt(urls.size)} ficheros en total, ${fmt(pending.length)} pendientes`);

  const fromDay = `${FROM_YEAR}-01-01`;
  const toDay = `${lastYear}-12-31`;
  let processed = 0;
  let days = 0;

  await mapLimit(pending, 4, async ([url, code]) => {
    const station = STATION_BY_CODE.get(code)!;
    try {
      const rows = await readParquet(url);
      const acc = new DailyAccumulator();
      for (const row of rows) {
        const m = mapRow(station.id, row);
        if (!m) continue;
        const day = officialDay(m.observedAt);
        if (day < fromDay || day > toDay) continue;
        acc.add(m.stationId, m.metric, m.value, m.unit, m.observedAt);
      }
      await upsertDaily(acc.rows());
      days += acc.size;
      done.add(url);
    } catch (err) {
      console.error(`  ✗ ${url.split("/").pop()}: ${(err as Error).message}`);
    }
    processed++;
    if (processed % 10 === 0 || processed === pending.length) {
      saveProgress(done);
      console.log(`  ${processed}/${pending.length} ficheros · ${fmt(days)} medias diarias guardadas`);
    }
  });
  saveProgress(done);
}

// ── 2. Año en curso → horarios + medias diarias ─────────────────────────────

async function loadCurrentYear(): Promise<void> {
  console.log(`\n## Año en curso ${CURRENT_YEAR} (datos horarios provisionales)`);
  const start = new Date(Date.parse(`${CURRENT_YEAR}-01-01T00:00:00Z`) - 3600_000); // 00:00 UTC+1
  const files = (await asturiasUrls(start, new Date())).filter(({ code }) => STATION_BY_CODE.has(code));
  console.log(`  ${files.length} ficheros`);

  let processed = 0;
  let inserted = 0;
  const months = new Set<string>();

  await mapLimit(files, 4, async ({ url, code }) => {
    const station = STATION_BY_CODE.get(code)!;
    try {
      const rows = (await readParquet(url))
        .map((r) => mapRow(station.id, r))
        .filter((m): m is Measurement => !!m && m.observedAt > start);
      inserted += await insertHourly(rows);
      for (const m of rows) months.add(officialDay(m.observedAt).slice(0, 7));
    } catch (err) {
      console.error(`  ✗ ${url.split("/").pop()}: ${(err as Error).message}`);
    }
    processed++;
    if (processed % 10 === 0 || processed === files.length) {
      console.log(`  ${processed}/${files.length} ficheros · ${fmt(inserted)} medidas horarias nuevas`);
    }
  });

  // Medias diarias mes a mes (consultas más pequeñas)
  console.log("  Calculando medias diarias…");
  for (const month of [...months].sort()) {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    await refreshDailyStats(db, [`${month}-01`, `${month}-${String(lastDay).padStart(2, "0")}`]);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`Carga histórica → ${target}`);
const t0 = Date.now();

// Las estaciones tienen que existir antes que sus datos
await db
  .insert(stations)
  .values(STATIONS)
  .onConflictDoUpdate({
    target: stations.id,
    set: { name: sql`excluded.name`, lat: sql`excluded.lat`, lon: sql`excluded.lon`, meta: sql`excluded.meta` },
  });

if (!ONLY_CURRENT) await loadHistory();
if (!ONLY_HISTORY) await loadCurrentYear();

console.log("\n## Resúmenes para la web");
await refreshSnapshots(
  db,
  STATIONS.map((s) => s.id),
  { forceHistory: true },
);

const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(dailyStats);
console.log(`\nListo en ${Math.round((Date.now() - t0) / 1000)} s. La tabla de medias diarias tiene ${fmt(n)} filas.`);
if (existsSync(PROGRESS_FILE) && !ONLY_CURRENT) console.log(`Progreso guardado en ${path.relative(ROOT_DIR, PROGRESS_FILE)}`);
