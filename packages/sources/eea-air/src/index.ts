/**
 * Plugin de calidad del aire con datos casi en tiempo real (UTD) de la Agencia Europea de Medio Ambiente.
 * Cubre las estaciones de la Red de Control de la Calidad del Aire del Principado de Asturias.
 */
import { EAQI, type Measurement, type SourcePlugin } from "@aviles/core";
import { Dataset, parquetUrls, readParquet } from "./api.ts";
import { mapRow, stationCodeFromSamplingPoint } from "./parse.ts";
import { IGNORED_CODES, SOURCE_ID, STATIONS, STATION_BY_CODE } from "./stations.ts";

export * from "./api.ts";
export { mapRow, POLLUTANTS, stationCodeFromSamplingPoint } from "./parse.ts";
export { STATIONS, STATION_BY_CODE, ZONES } from "./stations.ts";

/** Los códigos de estación de Asturias empiezan por el código de provincia */
const PROVINCE_PREFIX = "33";

/** Horas hacia atrás que se revisan en cada pasada. Los duplicados los descarta la BD. */
const WINDOW_HOURS = 72;

/** Descargas en paralelo (cada fichero trae el año entero de un contaminante). */
const CONCURRENCY = 6;

/** Ficheros sin datos recientes (puntos de muestreo dados de baja): no se vuelven a descargar en 24 h */
const STALE_SKIP_MS = 24 * 3600_000;
const staleUntil = new Map<string, number>();

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** URLs de ficheros UTD de toda España con datos en la ventana, filtradas a Asturias. */
export async function asturiasUrls(start: Date, end: Date): Promise<{ url: string; code: string }[]> {
  const urls = await parquetUrls({
    countries: ["ES"],
    dataset: Dataset.UpToDate,
    dateTimeStart: start.toISOString().slice(0, 19) + "Z",
    dateTimeEnd: end.toISOString().slice(0, 19) + "Z",
    aggregationType: "hour",
  });
  return urls.flatMap((url) => {
    const code = stationCodeFromSamplingPoint(url);
    return code?.startsWith(PROVINCE_PREFIX) ? [{ url, code }] : [];
  });
}

export const eeaAirSource: SourcePlugin = {
  id: SOURCE_ID,
  name: "Calidad del aire · Red del Principado de Asturias (vía EEA)",
  index: EAQI,

  stations: () => STATIONS,

  async fetch(): Promise<Measurement[]> {
    const end = new Date();
    const start = new Date(end.getTime() - WINDOW_HOURS * 3600_000);
    const files = await asturiasUrls(start, end);

    const unknown = new Set<string>();
    const targets = files.flatMap(({ url, code }) => {
      const station = STATION_BY_CODE.get(code);
      if (!station) {
        if (!IGNORED_CODES.has(code)) unknown.add(code);
        return [];
      }
      if ((staleUntil.get(url) ?? 0) > Date.now()) return [];
      return [{ url, stationId: station.id }];
    });
    if (unknown.size) {
      console.warn(`[${SOURCE_ID}] Estaciones de Asturias sin registrar (ignoradas): ${[...unknown].sort().join(", ")}`);
    }

    const perFile = await mapLimit(targets, CONCURRENCY, async ({ url, stationId }) => {
      try {
        const rows = await readParquet(url);
        const out: Measurement[] = [];
        // Las filas van en orden cronológico: recorremos desde el final y paramos al salir de la ventana
        for (let i = rows.length - 1; i >= 0; i--) {
          const m = mapRow(stationId, rows[i]);
          if (!m) continue;
          if (m.observedAt < start) break;
          out.push(m);
        }
        if (!out.length) staleUntil.set(url, Date.now() + STALE_SKIP_MS);
        return out;
      } catch (err) {
        console.error(`[${SOURCE_ID}] ${url.split("/").pop()}: ${(err as Error).message}`);
        return [];
      }
    });

    return perFile.flat();
  },
};
