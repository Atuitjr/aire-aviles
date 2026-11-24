/**
 * Cliente mínimo del Air Quality Download Service de la Agencia Europea de Medio Ambiente.
 * Swagger: https://eeadmz1-downloads-api-appservice.azurewebsites.net/swagger/index.html
 * Guía:    https://eeadmz1-downloads-webapp.azurewebsites.net/content/documentation/How_To_Downloads.pdf
 *
 * Funciona en dos pasos: se piden las URLs de los ficheros Parquet que cumplen el filtro
 * (un fichero por punto de muestreo = estación + contaminante) y luego se descargan.
 */
import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

export const API_BASE = "https://eeadmz1-downloads-api-appservice.azurewebsites.net";

/** 1 = UTD/E2a (sin verificar, casi en tiempo real) · 2 = E1a (verificados) · 3 = Airbase (histórico) */
export const Dataset = { UpToDate: 1, Verified: 2, Historical: 3 } as const;

export interface ParquetQuery {
  countries: string[];
  cities?: string[];
  pollutants?: string[];
  dataset: number;
  dateTimeStart?: string;
  dateTimeEnd?: string;
  aggregationType?: "hour" | "day" | "var";
}

async function post(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "*/*" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`EEA ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return res;
}

/** Ciudades disponibles para los países dados. */
export async function listCities(countries: string[]): Promise<unknown[]> {
  const res = await post("/City", countries);
  return (await res.json()) as unknown[];
}

/** URLs de los ficheros Parquet que cumplen el filtro. */
export async function parquetUrls(query: ParquetQuery): Promise<string[]> {
  const res = await post("/ParquetFile/urls", {
    cities: [],
    pollutants: [],
    aggregationType: "hour",
    email: "",
    ...query,
  });
  const text = await res.text();
  // La respuesta es un CSV con cabecera "ParquetFileUrl" y una URL por línea
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http"));
}

/** Descarga y lee un fichero Parquet como lista de objetos. */
export async function readParquet(url: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga ${res.status}: ${url}`);
  const file = await res.arrayBuffer();
  return (await parquetReadObjects({ file, compressors })) as Record<string, unknown>[];
}
