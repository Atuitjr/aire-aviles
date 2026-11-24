/**
 * Script de exploración:
 *   1. Comprueba si existe el dataset del año en curso y lo actualizado que está.
 *   2. Muestra el último registro de cada estación ya convertido a medidas.
 *
 *   npm run probe -w @aviles/source-aviles-air
 */
import { datastoreSearch, packageShow } from "./ckan.ts";
import { mapRecord } from "./parse.ts";
import { datasetIdForYear, resolveResources } from "./resources.ts";
import { STATIONS } from "./stations.ts";

const year = new Date().getFullYear();

for (const y of [year, year - 1]) {
  const pkg = await packageShow(datasetIdForYear(y));
  console.log(`\n### Dataset ${datasetIdForYear(y)}: ${pkg ? "existe" : "NO existe"}`);
  if (pkg) {
    console.log(`Última modificación del dataset: ${pkg.metadata_modified}`);
    for (const r of pkg.resources) {
      console.log(`  - ${r.name}  [${r.id}]  modificado: ${r.last_modified ?? r.created ?? "?"}`);
    }
  }
}

const { datasetId, byStation } = await resolveResources(year);
console.log(`\n### Recursos usados: ${datasetId ?? "respaldo (ids de 2025)"}`);

for (const station of STATIONS) {
  const resourceId = byStation.get(station.id)?.provisional;
  console.log(`\n=== ${station.name} (${resourceId ?? "sin recurso"}) ===`);
  if (!resourceId) continue;
  try {
    const { records, total } = await datastoreSearch(resourceId, 1);
    const last = records[0];
    console.log(`Registros: ${total} · último: ${last?.["Fecha y hora"] ?? "?"}`);
    const ms = last ? mapRecord(station.id, last) : [];
    if (!ms.length) console.log("  (sin valores en el último registro)");
    for (const m of ms) {
      console.log(`  ${m.metric.padEnd(8)} ${String(m.value).padStart(6)} ${m.unit}  ${m.observedAt.toISOString()}${m.provisional ? "  (provisional)" : ""}`);
    }
  } catch (err) {
    console.error("Error:", (err as Error).message);
  }
}
