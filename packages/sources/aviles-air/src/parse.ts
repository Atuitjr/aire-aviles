import type { Measurement } from "@aviles/core";

/**
 * Formato observado en datos.aviles.es (dataset "Calidad del aire, año 2025"):
 *
 *   'Fecha y hora': '31-12-2025 24:00'      ← DD-MM-YYYY HH:mm, con 24:00 = 00:00 del día siguiente
 *   'PM10 (NC-ug/m3)': '19'                 ← "MAGNITUD (unidad)", a veces con prefijo "NC-" en la unidad
 *   'flag-PM10': 'T'                        ← T = dato temporal/provisional, N = sin dato
 *   '-'                                     ← valor ausente
 *
 * Cada estación mide magnitudes distintas, así que las columnas se descubren dinámicamente.
 */

const DATE_FIELD = "Fecha y hora";
const COLUMN_RE = /^(.+?)\s*\((NC-)?([^)]+)\)$/;

const UNITS: Record<string, string> = {
  "ug/m3": "µg/m³",
  "mg/m3": "mg/m³",
  ppb: "ppb",
};

/** Zona horaria en la que el ayuntamiento publica las horas.
 *  Las redes de calidad del aire (y la EEA) usan UTC+1 fija, sin horario de verano.
 *  En IANA, "Etc/GMT-1" significa UTC+1 (el signo va al revés).
 *  TODO: confirmar comparando con los datos de la EEA para la misma estación y hora. */
export const SOURCE_TIMEZONE = "Etc/GMT-1";

/** "31-12-2025 24:00" → Date (UTC) interpretando la hora en `tz`. */
export function parseAvilesDate(raw: string, tz = SOURCE_TIMEZONE): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [, d, mo, y, h, mi] = m.map(Number) as unknown as number[];
  // Date.UTC normaliza la hora 24 al día siguiente
  return zonedToUtc(y, mo, d, h, mi, tz);
}

function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  let ts = asUtc - tzOffsetMs(asUtc, tz);
  ts = asUtc - tzOffsetMs(ts, tz); // segunda pasada para los cambios de hora
  return new Date(ts);
}

/** Desfase de `tz` respecto a UTC en el instante `ts`, en ms. */
function tzOffsetMs(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return local - Math.floor(ts / 1000) * 1000;
}

/** Convierte un registro crudo de CKAN en una medida por cada magnitud con valor. */
export function mapRecord(stationId: string, record: Record<string, unknown>): Measurement[] {
  const rawDate = record[DATE_FIELD];
  if (typeof rawDate !== "string") return [];
  const observedAt = parseAvilesDate(rawDate);
  if (!observedAt) return [];

  const out: Measurement[] = [];
  for (const [column, rawValue] of Object.entries(record)) {
    if (column === DATE_FIELD || column === "_id" || column.startsWith("flag-")) continue;

    const col = COLUMN_RE.exec(column);
    if (!col) continue;
    const metric = col[1].trim().toUpperCase();
    const unit = UNITS[col[3].trim()] ?? col[3].trim();

    const flag = String(record[`flag-${col[1].trim()}`] ?? "").trim().toUpperCase();
    if (flag === "N") continue;

    const value = Number(String(rawValue ?? "").trim().replace(",", "."));
    if (rawValue === "-" || rawValue === "" || !Number.isFinite(value)) continue;

    out.push({
      stationId,
      metric: metric === "NOX" ? "NOx" : metric,
      value,
      unit,
      observedAt,
      // Solo hemos visto "T" (temporal). Cualquier otro flag lo tratamos como validado.
      provisional: flag === "T",
    });
  }
  return out;
}
