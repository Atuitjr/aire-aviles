import { packageShow, type CkanResource } from "./ckan.ts";
import { STATIONS } from "./stations.ts";

/**
 * El ayuntamiento publica un dataset por año ("calidad-del-aire-ano-2025", ...),
 * con un recurso por estación y tipo de dato. Los ids cambian cada año, así que
 * los buscamos por nombre en el dataset del año en curso y, si no existe,
 * usamos los ids conocidos de stations.ts.
 */
export interface ResolvedResources {
  datasetId: string | null; // null = usando ids de respaldo
  byStation: Map<string, { provisional?: string; verified?: string }>;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function classify(r: CkanResource): "provisional" | "verified" | null {
  const n = norm(`${r.name} ${r.description ?? ""}`);
  if (/(tempor|provision)/.test(n)) return "provisional";
  if (/(verific|validad|verified)/.test(n)) return "verified";
  return null;
}

export function datasetIdForYear(year: number): string {
  return `calidad-del-aire-ano-${year}`;
}

let cache: { at: number; value: ResolvedResources } | null = null;
const CACHE_MS = 6 * 3600_000;

export async function resolveResources(year = new Date().getFullYear()): Promise<ResolvedResources> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const datasetId = datasetIdForYear(year);
  const pkg = await packageShow(datasetId);

  let value: ResolvedResources;
  if (pkg) {
    const byStation = new Map<string, { provisional?: string; verified?: string }>();
    for (const station of STATIONS) {
      const key = norm(station.name);
      const entry: { provisional?: string; verified?: string } = {};
      for (const r of pkg.resources) {
        if (!norm(r.name).includes(key)) continue;
        const kind = classify(r);
        if (kind) entry[kind] = r.id;
      }
      byStation.set(station.id, entry);
    }
    value = { datasetId, byStation };
  } else {
    value = {
      datasetId: null,
      byStation: new Map(
        STATIONS.map((s) => [
          s.id,
          { provisional: s.meta?.provisionalResourceId as string, verified: s.meta?.verifiedResourceId as string },
        ]),
      ),
    };
  }

  cache = { at: Date.now(), value };
  return value;
}
