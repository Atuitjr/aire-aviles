import type { Station } from "@aviles/core";

export const SOURCE_ID = "eea-air";

/**
 * Red de Control de la Calidad del Aire del Principado de Asturias.
 * Códigos, coordenadas (ETRS89) y zonas según el anexo de la resolución publicada en el BOPA el 02/07/2025:
 * https://medioambiente.asturias.es/documents/646140/0/RED_INMISION_MODIF_5_BOPA_02_07_2025.pdf
 *
 * El código de 8 cifras es el que aparece en los puntos de muestreo de la EEA:
 *   ES/SP_33004020_10_49  →  estación 33004020 (Llaranes)
 */
export const ZONES = {
  ES0307: "Avilés",
  ES0306: "Oviedo",
  ES0309: "Gijón",
  ES0308: "Cuencas",
  ES0311: "Asturias rural",
} as const;
export type ZoneCode = keyof typeof ZONES;

interface RawStation {
  zone: ZoneCode;
  name: string;
  eoi: string;
  /** Código con el que la EEA publica los datos (y que forma el id de la estación) */
  code: string;
  /** Otros códigos de la misma estación (p. ej. el del BOPA si la EEA usa uno antiguo) */
  aliases?: string[];
  lat: number;
  lon: number;
}

const RAW: RawStation[] = [
  // Zona Avilés
  { zone: "ES0307", name: "Jardín de Cantos", eoi: "ES2186A", code: "33004100", lat: 43.56805, lon: -5.92944 },
  { zone: "ES0307", name: "Llaranes", eoi: "ES0879A", code: "33004020", lat: 43.55031, lon: -5.89886 },
  // En el BOPA figura como 33004053, pero la EEA la publica con el código 33004021.
  // Confirmado el 24/11/2026: los datos verificados de 2025 coinciden al 100 % (PM10 y NO2, enero y julio)
  // con la serie municipal de Llano Ponte. Comprobación:
  //   npm run check:offset -- 33004021 23e82475-c090-438c-adf0-895f74dcf255
  // Se mantiene 33004021 como id para no perder el histórico ya guardado.
  { zone: "ES0307", name: "Llano Ponte", eoi: "ES0880A", code: "33004021", aliases: ["33004053"], lat: 43.55117, lon: -5.91966 },
  { zone: "ES0307", name: "Plaza de la Guitarra", eoi: "ES1424A", code: "33004049", lat: 43.55885, lon: -5.92748 },
  { zone: "ES0307", name: "Salinas", eoi: "ES2054A", code: "33004052", lat: 43.57045, lon: -5.95828 },
  // Aglomeración Oviedo
  { zone: "ES0306", name: "Plaza de Toros", eoi: "ES1268A", code: "33044029", lat: 43.35829, lon: -5.86643 },
  { zone: "ES0306", name: "Palacio de Deportes", eoi: "ES1269A", code: "33044030", lat: 43.36653, lon: -5.83303 },
  { zone: "ES0306", name: "Purificación Tomás", eoi: "ES1572A", code: "33044032", lat: 43.372675, lon: -5.872797 },
  { zone: "ES0306", name: "Trubia Piscinas", eoi: "ES2075A", code: "33044033", lat: 43.34565, lon: -5.96967 },
  { zone: "ES0306", name: "Lugones Instituto", eoi: "ES2051A", code: "33066004", lat: 43.4015, lon: -5.80287 },
  // Aglomeración Gijón
  { zone: "ES0309", name: "Constitución", eoi: "ES1272A", code: "33024025", lat: 43.52986, lon: -5.6735 },
  { zone: "ES0309", name: "Argentina", eoi: "ES1271A", code: "33024024", lat: 43.53886, lon: -5.698921 },
  { zone: "ES0309", name: "Avenida de Castilla", eoi: "ES1358A", code: "33024027", lat: 43.537771, lon: -5.64631 },
  { zone: "ES0309", name: "Montevil", eoi: "ES1974A", code: "33024031", lat: 43.51659, lon: -5.67065 },
  { zone: "ES0309", name: "Santa Bárbara", eoi: "ES2069A", code: "33024032", lat: 43.5229, lon: -5.68945 },
  { zone: "ES0309", name: "El Lauredal", eoi: "ES2132A", code: "33024099", lat: 43.54267, lon: -5.70925 },
  // Zona Cuencas
  { zone: "ES0308", name: "Meriñán", eoi: "ES0824A", code: "33031029", lat: 43.3069, lon: -5.705672 },
  { zone: "ES0308", name: "Sama I", eoi: "ES1353A", code: "33031032", lat: 43.294117, lon: -5.679632 },
  { zone: "ES0308", name: "La Felguera", eoi: "ES0825A", code: "33031030", lat: 43.306657, lon: -5.689716 },
  { zone: "ES0308", name: "Jardines de Juan XXIII", eoi: "ES1651A", code: "33037012", lat: 43.25612, lon: -5.77594 },
  { zone: "ES0308", name: "Blimea", eoi: "ES1433A", code: "33060003", lat: 43.275635, lon: -5.59599 },
  // Asturias rural
  { zone: "ES0311", name: "Cangas del Narcea", eoi: "ES1432A", code: "33011001", lat: 43.1788, lon: -6.5527 },
  { zone: "ES0311", name: "Somiedo", eoi: "ES2083A", code: "33068001", lat: 43.06964, lon: -6.1926 },
];

/**
 * Códigos que la EEA publica en Asturias y no están en el anexo del BOPA. No se ingieren
 * y no generan aviso en el log.
 *   33036999 · NO2, NOx, O3, SO2. No pertenece a la red del Principado; sin identificar.
 */
export const IGNORED_CODES = new Set(["33036999"]);

export const STATIONS: Station[] = RAW.map((s) => ({
  id: `${SOURCE_ID}:${s.code}`,
  sourceId: SOURCE_ID,
  name: s.name,
  lat: Number.isFinite(s.lat) ? s.lat : undefined,
  lon: Number.isFinite(s.lon) ? s.lon : undefined,
  meta: {
    code: s.code,
    aliases: s.aliases,
    eoiCode: s.eoi || undefined,
    zone: s.zone,
    zoneName: ZONES[s.zone],
    network: "Principado de Asturias",
  },
}));

/** Código EEA (o alias) → estación. Si la EEA empieza a usar el código nuevo, los datos van a la misma estación. */
export const STATION_BY_CODE = new Map(
  STATIONS.flatMap((s) => [s.meta!.code as string, ...((s.meta!.aliases as string[] | undefined) ?? [])].map((c) => [c, s] as const)),
);
