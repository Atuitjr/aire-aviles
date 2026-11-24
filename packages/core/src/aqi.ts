import type { IndexDefinition } from "./types.ts";

/**
 * Índice europeo de calidad del aire (EAQI) de la Agencia Europea de Medio Ambiente.
 * Bandas en µg/m³ sobre concentraciones horarias, revisión basada en las guías OMS 2021
 * y la Directiva (UE) 2024/2881. Fuente: https://airindex.eea.europa.eu/AQI
 *
 *            Buena  R.buena  Regular  Desfav.  Muy desf.  Extr. desf.
 *   PM2.5    0-5    6-15     16-50    51-90    91-140     >140
 *   PM10     0-15   16-45    46-120   121-195  196-270    >270
 *   O3       0-60   61-100   101-120  121-160  161-180    >180
 *   NO2      0-10   11-25    26-60    61-100   101-150    >150
 *   SO2      0-20   21-40    41-125   126-190  191-275    >275
 *
 * Nombres de nivel en español como en el Índice Nacional de Calidad del Aire.
 * Colores oficiales del índice; los emojis (para Telegram) son la aproximación más cercana a cada color.
 */
export const EAQI: IndexDefinition = {
  id: "eaqi",
  name: "Índice europeo de calidad del aire",
  bands: {
    "PM2.5": [5, 15, 50, 90, 140],
    PM10: [15, 45, 120, 195, 270],
    O3: [60, 100, 120, 160, 180],
    NO2: [10, 25, 60, 100, 150],
    SO2: [20, 40, 125, 190, 275],
  },
  // Avisamos a partir de "Desfavorable": "Regular" es frecuente y no requiere cambiar hábitos
  alertFrom: 3,
  levels: [
    {
      label: "Buena",
      icon: "🔵",
      color: "#50F0E6",
      advice: "Disfruta de tus actividades al aire libre.",
      adviceSensitive: "Disfruta de tus actividades al aire libre.",
    },
    {
      label: "Razonablemente buena",
      icon: "🟢",
      color: "#50CCAA",
      advice: "Disfruta de tus actividades al aire libre.",
      adviceSensitive: "Disfruta de tus actividades al aire libre.",
    },
    {
      label: "Regular",
      icon: "🟡",
      color: "#F0E641",
      advice: "Disfruta de tus actividades al aire libre.",
      adviceSensitive: "Plantéate reducir la actividad intensa al aire libre si notas síntomas.",
    },
    {
      label: "Desfavorable",
      icon: "🔴",
      color: "#FF5050",
      advice: "Plantéate reducir la actividad intensa al aire libre si notas picor de ojos, tos o dolor de garganta.",
      adviceSensitive: "Plantéate reducir la actividad física, sobre todo al aire libre, si notas síntomas.",
    },
    {
      label: "Muy desfavorable",
      icon: "🟤",
      color: "#960032",
      advice: "Plantéate reducir la actividad intensa al aire libre si notas picor de ojos, tos o dolor de garganta.",
      adviceSensitive: "Reduce la actividad física, sobre todo al aire libre, si notas síntomas.",
    },
    {
      label: "Extremadamente desfavorable",
      icon: "🟣",
      color: "#7D2181",
      advice: "Reduce la actividad física al aire libre.",
      adviceSensitive: "Evita la actividad física al aire libre.",
    },
  ],
};

/** Nivel de una magnitud; null si el índice no la contempla. */
export function classify(index: IndexDefinition, metric: string, value: number): number | null {
  const bands = index.bands[metric];
  if (!bands) return null;
  // Las bandas oficiales son de enteros (0-5, 6-15...): redondeamos antes de comparar
  const v = Math.round(value);
  for (let i = 0; i < bands.length; i++) if (v <= bands[i]) return i;
  return bands.length;
}

export interface StationLevel {
  level: number;
  metric: string;
  value: number;
  unit: string;
}

/** Nivel de una estación a partir de sus medidas de una misma hora: el peor contaminante. */
export function stationLevel(
  index: IndexDefinition,
  measurements: { metric: string; value: number; unit: string }[],
): StationLevel | null {
  let worst: StationLevel | null = null;
  for (const m of measurements) {
    const level = classify(index, m.metric, m.value);
    if (level === null) continue;
    if (!worst || level > worst.level) worst = { level, metric: m.metric, value: m.value, unit: m.unit };
  }
  return worst;
}
