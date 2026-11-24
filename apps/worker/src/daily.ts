import type { DB } from "@aviles/db";
import { sql } from "drizzle-orm";

/**
 * Medias diarias (tabla daily_stats).
 *
 * Los datos oficiales usan días en UTC+1 fija, y cada valor horario se etiqueta con el final
 * de su hora: la hora que termina a las 24:00 (= 23:00 UTC) pertenece a ese día.
 */
const UTC_PLUS_1 = 3600_000;

/** Día oficial ("2025-01-31") al que pertenece una hora que termina en `observedAt` */
export function officialDay(observedAt: Date): string {
  return new Date(observedAt.getTime() + UTC_PLUS_1 - 1).toISOString().slice(0, 10);
}

/** Intervalo (inicio exclusivo, fin inclusivo) en UTC de un día oficial */
export function dayBounds(day: string): { start: Date; end: Date } {
  const midnightUtc = Date.parse(`${day}T00:00:00Z`);
  return { start: new Date(midnightUtc - UTC_PLUS_1), end: new Date(midnightUtc + 24 * 3600_000 - UTC_PLUS_1) };
}

/**
 * Recalcula las medias diarias de los días indicados a partir de los datos horarios guardados.
 * Una sola sentencia para todos los días y estaciones afectados.
 */
export async function refreshDailyStats(db: DB, days: string[]): Promise<void> {
  if (!days.length) return;
  const sorted = [...new Set(days)].sort();
  const from = dayBounds(sorted[0]).start;
  const to = dayBounds(sorted[sorted.length - 1]).end;
  const fromSec = Math.floor(from.getTime() / 1000);
  const toSec = Math.floor(to.getTime() / 1000);

  await db.run(sql`
    INSERT INTO daily_stats (station_id, metric, day, mean, max, hours, unit)
    SELECT station_id, metric,
           date(observed_at + 3599, 'unixepoch') AS day,
           round(avg(value), 2), max(value), count(*), max(unit)
    FROM measurements
    WHERE observed_at > ${fromSec} AND observed_at <= ${toSec}
    GROUP BY station_id, metric, day
    ON CONFLICT (station_id, metric, day) DO UPDATE SET
      mean = excluded.mean, max = excluded.max, hours = excluded.hours, unit = excluded.unit
  `);
}

export interface DailyRow {
  stationId: string;
  metric: string;
  day: string;
  mean: number;
  max: number;
  hours: number;
  unit: string;
}

/** Acumula medidas horarias en memoria y devuelve medias diarias (para la carga histórica). */
export class DailyAccumulator {
  private acc = new Map<string, { sum: number; max: number; n: number; unit: string }>();

  add(stationId: string, metric: string, value: number, unit: string, observedAt: Date): void {
    const key = `${stationId}|${metric}|${officialDay(observedAt)}`;
    const a = this.acc.get(key);
    if (a) {
      a.sum += value;
      a.n += 1;
      if (value > a.max) a.max = value;
    } else {
      this.acc.set(key, { sum: value, max: value, n: 1, unit });
    }
  }

  get size(): number {
    return this.acc.size;
  }

  rows(): DailyRow[] {
    return [...this.acc].map(([key, a]) => {
      const [stationId, metric, day] = key.split("|");
      return { stationId, metric, day, mean: Math.round((a.sum / a.n) * 100) / 100, max: a.max, hours: a.n, unit: a.unit };
    });
  }
}
