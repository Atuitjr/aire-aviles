import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ROOT_DIR, loadEnv } from "@aviles/core/env";
import * as schema from "./schema.ts";
import type { DB } from "./types.ts";

loadEnv();

/**
 * En local usa un fichero SQLite en <raíz>/data/aviles.db.
 * En producción basta con poner DATABASE_URL=libsql://... (Turso) y DATABASE_AUTH_TOKEN.
 */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url && !url.startsWith("file:")) return url;

  const rel = url ? url.slice("file:".length) : "./data/aviles.db";
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT_DIR, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  return `file:${abs}`;
}

const url = databaseUrl();
const client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});

/**
 * En local varios procesos (worker, bot, api, scripts) comparten el mismo fichero SQLite.
 * - busy_timeout: si otro proceso está escribiendo, esperar hasta 15 s en vez de fallar con SQLITE_BUSY.
 * - WAL: lectores y escritor pueden trabajar a la vez (se crean ficheros aviles.db-wal y -shm, es normal).
 * Turso (libsql://) gestiona la concurrencia por su cuenta.
 */
export const isLocalFile = url.startsWith("file:");
const applyBusyTimeout = () => client.execute("PRAGMA busy_timeout = 15000");

if (isLocalFile) {
  await applyBusyTimeout();
  await client.execute("PRAGMA journal_mode = WAL");
}

export const db: DB = drizzle(client, { schema });
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Transacción de escritura. Usar esta en lugar de db.transaction():
 * el cliente de libsql abre una conexión nueva tras cada transacción y esa conexión
 * no hereda busy_timeout, así que lo volvemos a aplicar al terminar.
 */
export async function writeTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(fn);
  } finally {
    if (isLocalFile) await applyBusyTimeout();
  }
}
