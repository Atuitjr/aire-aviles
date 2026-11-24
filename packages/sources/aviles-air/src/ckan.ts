const BASE_URL = "https://datos.aviles.es/api/3/action";

export interface DatastoreResult {
  fields: { id: string; type: string }[];
  records: Record<string, unknown>[];
  total: number;
}

export interface CkanResource {
  id: string;
  name: string;
  description?: string;
  last_modified?: string | null;
  created?: string;
}

export interface CkanPackage {
  name: string;
  title: string;
  metadata_modified: string;
  resources: CkanResource[];
}

async function call<T>(action: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}/${action}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const body = (await res.json().catch(() => null)) as { success: boolean; result: T; error?: unknown } | null;
  if (!res.ok || !body?.success) {
    throw new Error(`CKAN ${action} ${res.status}: ${JSON.stringify(body?.error ?? res.statusText)}`);
  }
  return body.result;
}

/** Últimos registros de un recurso (orden descendente). */
export function datastoreSearch(resourceId: string, limit = 100): Promise<DatastoreResult> {
  return call<DatastoreResult>("datastore_search", {
    resource_id: resourceId,
    limit: String(limit),
    sort: "_id desc",
  });
}

/** Metadatos de un dataset; null si no existe. */
export async function packageShow(id: string): Promise<CkanPackage | null> {
  try {
    return await call<CkanPackage>("package_show", { id });
  } catch {
    return null;
  }
}
