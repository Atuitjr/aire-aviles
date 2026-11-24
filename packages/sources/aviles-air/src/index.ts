import type { Measurement, SourcePlugin } from "@aviles/core";
import { datastoreSearch } from "./ckan.ts";
import { mapRecord } from "./parse.ts";
import { resolveResources } from "./resources.ts";
import { SOURCE_ID, STATIONS } from "./stations.ts";

export { STATIONS } from "./stations.ts";
export { mapRecord, parseAvilesDate } from "./parse.ts";
export { datastoreSearch } from "./ckan.ts";

/** Registros por estación en cada pasada (48 = dos días de datos horarios). */
const RECORDS_PER_FETCH = 48;

export const avilesAirSource: SourcePlugin = {
  id: SOURCE_ID,
  name: "Calidad del aire · Ayuntamiento de Avilés",

  stations: () => STATIONS,

  async fetch(since?: Date): Promise<Measurement[]> {
    const { datasetId, byStation } = await resolveResources();
    if (!datasetId) {
      console.warn(`[${SOURCE_ID}] No hay dataset del año en curso; usando los recursos de respaldo (2025).`);
    }

    const all: Measurement[] = [];
    for (const station of STATIONS) {
      const resourceId = byStation.get(station.id)?.provisional;
      if (!resourceId) {
        console.warn(`[${SOURCE_ID}] ${station.name}: sin recurso de datos provisionales`);
        continue;
      }
      try {
        const { records } = await datastoreSearch(resourceId, RECORDS_PER_FETCH);
        const measurements = records
          .flatMap((r) => mapRecord(station.id, r))
          .filter((m) => !since || m.observedAt > since);
        all.push(...measurements);
      } catch (err) {
        console.error(`[${SOURCE_ID}] Error en ${station.name}:`, (err as Error).message);
      }
    }
    return all;
  },
};
