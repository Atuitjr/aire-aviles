/**
 * Tipos compartidos del motor: fuente → normalizar → clasificar → avisar.
 * Todo lo específico de un dominio (aire, oleaje, ríos...) vive en los plugins;
 * aquí solo hay contratos genéricos.
 */

/** Un punto de medida: estación de calidad del aire, boya, aforo de río... */
export interface Station {
  /** Id estable y único entre todas las fuentes, p. ej. "eea-air:33004020" */
  id: string;
  sourceId: string;
  name: string;
  lat?: number;
  lon?: number;
  /** Metadatos propios de la fuente (códigos, ids de recurso...) */
  meta?: Record<string, unknown>;
}

/** Una lectura normalizada. Independiente de la fuente. */
export interface Measurement {
  stationId: string;
  /** Magnitud medida: "PM10", "NO2", "wave_height"... */
  metric: string;
  value: number;
  unit: string;
  /** Instante de la medida (UTC). En datos horarios, el final de la hora. */
  observedAt: Date;
  /** true si el dato es provisional (no validado por el organismo) */
  provisional?: boolean;
}

/** Un nivel de un índice (p. ej. "Desfavorable" en el índice europeo de calidad del aire). */
export interface IndexLevel {
  label: string;
  icon: string;
  color: string;
  /** Recomendación para la población general */
  advice: string;
  /** Recomendación para población sensible */
  adviceSensitive: string;
}

/**
 * Índice que clasifica las medidas de una fuente en niveles.
 * El nivel de una estación en una hora es el peor nivel de sus magnitudes.
 */
export interface IndexDefinition {
  id: string;
  name: string;
  levels: IndexLevel[];
  /** Límite superior (inclusive) de cada nivel salvo el último, por magnitud */
  bands: Record<string, number[]>;
  /** Primer nivel que abre un episodio y genera aviso */
  alertFrom: number;
}

/** Contrato que implementa cada fuente de datos. */
export interface SourcePlugin {
  id: string;
  name: string;
  /** Estaciones que expone esta fuente */
  stations(): Promise<Station[]> | Station[];
  /**
   * Devuelve las medidas recientes. El worker se encarga de deduplicar al guardar,
   * así que no pasa nada por devolver datos ya vistos.
   */
  fetch(since?: Date): Promise<Measurement[]>;
  /** Si la fuente tiene índice, el worker gestiona episodios y avisos con él */
  index?: IndexDefinition;
}

export type AlertKind = "start" | "worse" | "end";

/** Aviso de episodio en una estación. */
export interface Alert {
  kind: AlertKind;
  stationId: string;
  indexId: string;
  /** Nivel actual (en "end", el nivel al que ha vuelto) */
  level: number;
  levelInfo: IndexLevel;
  /** Magnitud que determina el nivel y su valor */
  metric: string;
  value: number;
  unit: string;
  observedAt: Date;
}

/** Canal de aviso: consola, Telegram, web push, email... */
export interface Notifier {
  id: string;
  /** Envía la alerta a los destinatarios suscritos en ese canal */
  send(alert: Alert, recipients: string[], station: Station): Promise<void>;
}
