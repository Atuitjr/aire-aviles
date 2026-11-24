import { EAQI } from "@aviles/core";

export const LEVELS = EAQI.levels;

/** Texto legible sobre el color de cada nivel: tinta oscura en los claros, blanco en los oscuros */
export function inkOn(level: number): string {
  return level >= 4 ? "#ffffff" : "#13272c";
}

/** Nombres legibles de los contaminantes */
export const METRIC_NAME: Record<string, string> = {
  "PM2.5": "Partículas finas PM2.5",
  PM10: "Partículas PM10",
  NO2: "Dióxido de nitrógeno (NO₂)",
  O3: "Ozono (O₃)",
  SO2: "Dióxido de azufre (SO₂)",
  CO: "Monóxido de carbono (CO)",
  BENCENO: "Benceno",
  NO: "Monóxido de nitrógeno (NO)",
  NOx: "Óxidos de nitrógeno (NOx)",
};

/** Etiqueta corta (para botones y ejes) */
export const METRIC_SHORT: Record<string, string> = {
  "PM2.5": "PM2.5",
  PM10: "PM10",
  NO2: "NO₂",
  O3: "O₃",
  SO2: "SO₂",
  CO: "CO",
  BENCENO: "Benceno",
  NO: "NO",
  NOx: "NOx",
};

/** Orden de presentación: primero los del índice */
export const METRIC_ORDER = ["PM2.5", "PM10", "NO2", "O3", "SO2", "CO", "BENCENO", "NO", "NOx"];
export const metricRank = (m: string) => METRIC_ORDER.indexOf(m) + 1 || 99;

export const isIndexMetric = (m: string) => m in EAQI.bands;

/** Frase para el titular: "está razonablemente bueno", "es desfavorable"... */
export function levelPhrase(level: number): string {
  return [
    "El aire está bien",
    "El aire está razonablemente bien",
    "La calidad del aire es regular",
    "La calidad del aire es desfavorable",
    "La calidad del aire es muy desfavorable",
    "La calidad del aire es extremadamente desfavorable",
  ][level];
}
