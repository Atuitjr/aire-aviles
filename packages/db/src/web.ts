/**
 * Cliente de BD para entornos sin sistema de ficheros (Cloudflare Workers).
 * Se conecta a Turso por HTTP. Importar como "@aviles/db/web".
 */
import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";
import * as schema from "./schema.ts";
import type { DB } from "./types.ts";

export * from "./schema.ts";
export type { DB } from "./types.ts";

export function createWebDb(url: string, authToken?: string): DB {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema }) as unknown as DB;
}
