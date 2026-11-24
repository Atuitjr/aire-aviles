import type { Measurement } from "@aviles/core";

/**
 * Formato observado en los Parquet UTD de la EEA:
 *   { Samplingpoint: 'ES/SP_33004020_10_49', Pollutant: 5, Start: Date, End: Date,
 *     Value: 13, Unit: 'ug.m-3', AggType: 'hour', Validity: 1, Verification: 3, ResultTime: Date, ... }
 *
 * - Value = -999 y Validity = -1 → hora sin dato válido (huecos y horas aún no recibidas).
 * - Verification = 3 → dato no verificado (provisional).
 * - Un fichero = un punto de muestreo (estación + contaminante) con todo el año en curso.
 */

/** Códigos de contaminante de la EEA (http://dd.eionet.europa.eu/vocabulary/aq/pollutant) */
export const POLLUTANTS: Record<number, string> = {
  1: "SO2",
  5: "PM10",
  6001: "PM2.5",
  7: "O3",
  8: "NO2",
  9: "NOx",
  10: "CO",
  20: "BENCENO",
  38: "NO",
};

const UNITS: Record<string, string> = {
  "ug.m-3": "µg/m³",
  "mg.m-3": "mg/m³",
};

/**
 * Corrección horaria de los Parquet de la EEA para la red de Asturias, comprobada con
 * `npm run check:offset` (datos verificados 2025 de Llaranes, 100 % de coincidencia en enero y julio):
 *
 *   final real de la hora (UTC) = End del Parquet − 2 h
 *
 * Es decir: la hora va en UTC+1 fija (sin horario de verano) y, además, el valor que el
 * ayuntamiento etiqueta como "hora que termina a las H" aparece en la EEA con End = H + 1.
 * Tomamos como referencia el ayuntamiento, que usa la convención estándar de la red (01:00…24:00).
 */
export const EEA_TIME_OFFSET_MS = 2 * 3600_000;

/** "ES/SP_33004020_10_49" → "33004020" */
export function stationCodeFromSamplingPoint(sp: string): string | null {
  return /SP_(\d+)_/.exec(sp)?.[1] ?? null;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "bigint") return new Date(Number(v));
  return null;
}

/** Convierte una fila del Parquet en una medida; null si no es válida o no la conocemos. */
export function mapRow(stationId: string, row: Record<string, unknown>): Measurement | null {
  const value = Number(row.Value);
  const validity = Number(row.Validity);
  if (!Number.isFinite(value) || value === -999 || !(validity >= 1)) return null;
  if (row.AggType !== undefined && row.AggType !== "hour") return null;

  const metric = POLLUTANTS[Number(row.Pollutant)];
  if (!metric) return null;

  // Etiquetamos cada valor horario con el final de la hora (igual que "24:00" en los datos municipales)
  const end = toDate(row.End);
  if (!end) return null;

  const unitRaw = String(row.Unit ?? "");
  return {
    stationId,
    metric,
    value,
    unit: UNITS[unitRaw] ?? unitRaw,
    observedAt: new Date(end.getTime() - EEA_TIME_OFFSET_MS),
    provisional: Number(row.Verification) !== 1,
  };
}
