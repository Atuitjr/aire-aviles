/**
 * Comprueba que las horas de la EEA y las del Ayuntamiento de Avilés cuadran.
 *
 * Compara los datos VERIFICADOS de 2025 de la estación de Llaranes en las dos fuentes
 * (la misma estación física de la red del Principado), probando desfases de -3 a +3 horas.
 * Se hace por separado en enero y en julio: si en verano el mejor desfase cambia,
 * alguna de las dos fuentes usa horario de verano en lugar de UTC+1 fija.
 *
 * También sirve para comprobar que un código de la EEA corresponde a una estación del ayuntamiento:
 * si coinciden al 100 % con desfase 0, es la misma estación.
 *
 *   npm run check:offset                                  ← Llaranes (por defecto)
 *   npm run check:offset -- <código EEA> <recurso CKAN verificados 2025 del ayuntamiento>
 */
import { datastoreSearch, mapRecord } from "@aviles/source-aviles-air";
import { Dataset, parquetUrls, readParquet } from "./api.ts";
import { mapRow, stationCodeFromSamplingPoint } from "./parse.ts";

const STATION_CODE = process.argv[2] ?? "33004020"; // Llaranes
const COUNCIL_VERIFIED_RESOURCE = process.argv[3] ?? "51bb2d47-e6a2-423f-9afa-edc23812af86"; // Llaranes, verificados 2025
const METRICS = ["PM10", "NO2"];
const OFFSETS = [-3, -2, -1, 0, 1, 2, 3];
const H = 3600_000;

type Series = Map<number, number>; // instante (ms) → valor

// 1. Ayuntamiento
console.log(`Descargando datos del ayuntamiento (recurso ${COUNCIL_VERIFIED_RESOURCE}, verificados 2025)…`);
const council = await datastoreSearch(COUNCIL_VERIFIED_RESOURCE, 9000);
const councilSeries = new Map<string, Series>(METRICS.map((m) => [m, new Map()]));
for (const r of council.records) {
  for (const m of mapRecord("x", r)) councilSeries.get(m.metric)?.set(m.observedAt.getTime(), m.value);
}
console.log(`  ${council.records.length} registros · ${METRICS.map((m) => `${m}: ${councilSeries.get(m)!.size}`).join(" · ")}`);

// 2. EEA (E1a, verificados)
console.log("Descargando datos verificados de la EEA (2025)…");
const urls = (
  await parquetUrls({
    countries: ["ES"],
    cities: ["Avilés"],
    dataset: Dataset.Verified,
    dateTimeStart: "2025-01-01T00:00:00Z",
    dateTimeEnd: "2025-12-31T23:59:59Z",
    aggregationType: "hour",
  })
).filter((u) => stationCodeFromSamplingPoint(u) === STATION_CODE);
console.log(`  ${urls.length} ficheros de la estación ${STATION_CODE}`);

const eeaSeries = new Map<string, Series>(METRICS.map((m) => [m, new Map()]));
for (const url of urls) {
  const rows = await readParquet(url);
  for (const row of rows) {
    const m = mapRow("x", row);
    if (m && m.observedAt.getUTCFullYear() === 2025) eeaSeries.get(m.metric)?.set(m.observedAt.getTime(), m.value);
  }
}
console.log(`  ${METRICS.map((m) => `${m}: ${eeaSeries.get(m)!.size}`).join(" · ")}`);

// 3. Comparar
function matchRate(metric: string, month: number, offsetH: number): { pairs: number; equal: number } {
  const a = councilSeries.get(metric)!;
  const b = eeaSeries.get(metric)!;
  let pairs = 0;
  let equal = 0;
  for (const [t, v] of a) {
    if (new Date(t).getUTCMonth() !== month) continue;
    const w = b.get(t + offsetH * H);
    if (w === undefined) continue;
    pairs++;
    if (Math.abs(v - w) < 0.5) equal++;
  }
  return { pairs, equal };
}

console.log("\nCoincidencias (valores iguales) según el desfase aplicado a la EEA:");
for (const metric of METRICS) {
  for (const [month, name] of [
    [0, "enero"],
    [6, "julio"],
  ] as const) {
    const results = OFFSETS.map((o) => ({ o, ...matchRate(metric, month, o) }));
    const best = results.reduce((x, y) => (y.equal > x.equal ? y : x));
    const line = results.map((r) => `${r.o >= 0 ? "+" : ""}${r.o}h: ${r.pairs ? Math.round((100 * r.equal) / r.pairs) : 0}%`);
    console.log(`  ${metric.padEnd(5)} ${name.padEnd(6)} ${line.join("  ")}   → mejor: ${best.o >= 0 ? "+" : ""}${best.o}h`);
  }
}

console.log(
  "\nSi el mejor desfase es 0h en enero y en julio, las dos fuentes están alineadas y en UTC+1 fija.\n" +
    "Si en julio sale ±1h, una de las dos usa horario de verano: pásame esta salida.",
);
