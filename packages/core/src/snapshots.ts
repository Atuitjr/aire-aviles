/**
 * Formato de los resúmenes que la ingesta guarda en la tabla `snapshots` y que la API sirve a la web.
 * Compartido entre quien los escribe (worker) y quien los lee (web), para que no se desincronicen.
 */

export const SNAPSHOT_KEYS = {
  status: "status",
  recent: (stationId: string) => `recent:${stationId}`,
  history: (stationId: string) => `history:${stationId}`,
  historyBuiltAt: "meta:history-built-at",
} as const;

/** Último valor de un contaminante */
export interface LatestValue {
  value: number;
  unit: string;
  /** Nivel del índice europeo, o null si el contaminante no forma parte de él */
  level: number | null;
  /** Epoch en segundos (final de la hora, UTC) */
  t: number;
}

export interface StationStatusSnapshot {
  id: string;
  name: string;
  zone: string;
  zoneName: string;
  lat: number | null;
  lon: number | null;
  /** Nivel de la estación (peor contaminante) en su última hora con datos */
  level: number;
  metric: string;
  value: number;
  unit: string;
  t: number;
  latest: Record<string, LatestValue>;
}

/** GET /api/status */
export interface StatusSnapshot {
  generatedAt: number;
  stations: StationStatusSnapshot[];
}

/** Serie horaria de un contaminante: tiempos (epoch s, final de la hora) y valores */
export interface HourlySeries {
  unit: string;
  t: number[];
  v: number[];
}

/** GET /api/stations/:id/recent — últimos 14 días, valores horarios */
export interface RecentSnapshot {
  stationId: string;
  generatedAt: number;
  series: Record<string, HourlySeries>;
}

/** Serie diaria o mensual: etiquetas ("2025-01-31" o "2025-01"), media y máximo */
export interface AggregatedSeries {
  unit: string;
  labels: string[];
  mean: number[];
  max: number[];
}

/** GET /api/stations/:id/history — último año en medias diarias y todo el histórico en medias mensuales */
export interface HistorySnapshot {
  stationId: string;
  generatedAt: number;
  daily: Record<string, AggregatedSeries>;
  monthly: Record<string, AggregatedSeries>;
}
