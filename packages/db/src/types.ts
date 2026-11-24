import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "./schema.ts";

/** Tipo común de la BD: el mismo en Node (fichero local o Turso) y en Cloudflare Workers (Turso por HTTP). */
export type DB = LibSQLDatabase<typeof schema>;
