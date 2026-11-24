import { stationLevel, type Alert, type IndexDefinition } from "@aviles/core";
import { db, measurements, stationStatus } from "@aviles/db";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Lógica de episodios por estación:
 *
 *   - Un episodio empieza cuando el nivel de la estación llega a `index.alertFrom` (Desfavorable).
 *   - Se avisa al empezar ("start") y cada vez que alcanza un nivel peor que el ya avisado ("worse").
 *   - Termina cuando pasa CLEAR_HOURS horas seguidas por debajo del umbral ("end").
 *     Así un valor que oscila alrededor del umbral no genera un aviso cada hora.
 *
 * "start" y "worse" solo se envían si el dato es reciente (MAX_ALERT_AGE): no tiene sentido
 * avisar hoy de un pico de hace dos días. "end" se envía siempre que se hubiera avisado del inicio.
 */
export const CLEAR_HOURS = 2;
export const MAX_ALERT_AGE_MS = 8 * 3600_000;

/** Procesa en orden las horas nuevas de una estación y devuelve los avisos a enviar. */
export async function evaluateStation(
  stationId: string,
  index: IndexDefinition,
  newHours: Date[],
  now = new Date(),
): Promise<Alert[]> {
  if (!newHours.length) return [];
  // La BD guarda los instantes con precisión de segundos: normalizamos para que las comparaciones cuadren
  const toSec = (t: number) => Math.floor(t / 1000) * 1000;
  const hours = [...new Set(newHours.map((h) => toSec(h.getTime())))].sort((a, b) => a - b).map((t) => new Date(t));

  // Todas las medidas de esas horas (incluidas las que ya estaban guardadas de pasadas anteriores)
  const rows = await db
    .select({ metric: measurements.metric, value: measurements.value, unit: measurements.unit, observedAt: measurements.observedAt })
    .from(measurements)
    .where(and(eq(measurements.stationId, stationId), inArray(measurements.observedAt, hours)));

  const byHour = new Map<number, typeof rows>();
  for (const r of rows) {
    const k = r.observedAt.getTime();
    byHour.set(k, [...(byHour.get(k) ?? []), r]);
  }

  const [prev] = await db.select().from(stationStatus).where(eq(stationStatus.stationId, stationId));
  let state = prev ?? null;

  for (const hour of hours) {
    // Si llegan datos atrasados de una hora anterior al estado actual, no reescribimos la historia
    if (state && hour < state.observedAt) continue;

    const lvl = stationLevel(index, byHour.get(hour.getTime()) ?? []);
    if (!lvl) continue;

    const base = state ?? {
      stationId,
      indexId: index.id,
      episodeStart: null,
      peakLevel: 0,
      notifiedLevel: 0,
      hoursBelow: 0,
    };
    let { episodeStart, peakLevel, hoursBelow } = base;

    if (lvl.level >= index.alertFrom) {
      episodeStart ??= hour;
      peakLevel = Math.max(peakLevel, lvl.level);
      hoursBelow = 0;
    } else if (episodeStart) {
      hoursBelow += 1;
      if (hoursBelow >= CLEAR_HOURS) {
        episodeStart = null;
        peakLevel = 0;
        hoursBelow = 0;
      }
    }

    state = {
      ...base,
      indexId: index.id,
      level: lvl.level,
      metric: lvl.metric,
      value: lvl.value,
      unit: lvl.unit,
      observedAt: hour,
      episodeStart,
      peakLevel,
      hoursBelow,
      notifiedLevel: base.notifiedLevel,
    };
  }

  if (!state) return [];

  // Decidir avisos comparando el estado final con lo ya avisado
  const alerts: Alert[] = [];
  const recent = now.getTime() - state.observedAt.getTime() <= MAX_ALERT_AGE_MS;
  const make = (kind: Alert["kind"]): Alert => ({
    kind,
    stationId,
    indexId: index.id,
    level: state!.level,
    levelInfo: index.levels[state!.level],
    metric: state!.metric,
    value: state!.value,
    unit: state!.unit,
    observedAt: state!.observedAt,
  });

  const inEpisode = state.episodeStart !== null;
  let notifiedLevel = state.notifiedLevel;

  if (inEpisode && recent && state.level >= index.alertFrom) {
    if (notifiedLevel === 0) {
      alerts.push(make("start"));
      notifiedLevel = state.level;
    } else if (state.level > notifiedLevel) {
      alerts.push(make("worse"));
      notifiedLevel = state.level;
    }
  } else if (!inEpisode && notifiedLevel > 0) {
    alerts.push(make("end"));
    notifiedLevel = 0;
  }

  const final = { ...state, notifiedLevel };
  await db
    .insert(stationStatus)
    .values(final)
    .onConflictDoUpdate({ target: stationStatus.stationId, set: final });

  return alerts;
}
