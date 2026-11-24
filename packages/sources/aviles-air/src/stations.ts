import type { Station } from "@aviles/core";

export const SOURCE_ID = "aviles-air";

/**
 * Estaciones de la red municipal de Avilés (datos.aviles.es, dataset "Calidad del aire, año 2025").
 * Cada estación tiene un recurso CKAN con datos provisionales y otro con datos verificados.
 *
 * TODO: comprobar si existe ya el dataset de 2026 y si los ids de recurso cambian cada año.
 * TODO: añadir coordenadas (lat/lon) de cada estación.
 */
const RAW = [
  { slug: "plaza-guitarra", name: "Plaza Guitarra", provisional: "4f1fe5d9-e876-4776-89cd-88eb90e122ed", verified: "850b5263-9748-40b3-9707-a577262e160d" },
  { slug: "matadero", name: "Matadero", provisional: "ce7b3c48-6cc7-4438-89bb-b4a2afb328ce", verified: "0210bcbf-1c6d-4af7-a418-694e5dc38833" },
  { slug: "llano-ponte", name: "Llano Ponte", provisional: "106a08ee-2991-4bd2-ab3f-7432847feadd", verified: "23e82475-c090-438c-adf0-895f74dcf255" },
  { slug: "llaranes", name: "Llaranes", provisional: "725beed3-04b7-4745-baca-11213c582297", verified: "51bb2d47-e6a2-423f-9afa-edc23812af86" },
  { slug: "jardin-de-cantos", name: "Jardín de Cantos", provisional: "c507cc39-1118-450a-8783-cf20665d2f0a", verified: "9b6c0b76-bc93-4a59-b1c6-5728f9946bbb" },
] as const;

export const STATIONS: Station[] = RAW.map((s) => ({
  id: `${SOURCE_ID}:${s.slug}`,
  sourceId: SOURCE_ID,
  name: s.name,
  meta: { provisionalResourceId: s.provisional, verifiedResourceId: s.verified },
}));
