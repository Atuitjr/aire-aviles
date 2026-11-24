/**
 * API pública de solo lectura para la web. Cada petición lee UNA fila de la tabla `snapshots`
 * (los resúmenes los prepara la ingesta cada hora), así las visitas apenas gastan cuota de Turso.
 *
 *   GET /api/status                       → estado actual de todas las estaciones
 *   GET /api/stations/<id>/recent         → últimos 14 días, horario
 *   GET /api/stations/<id>/history        → último año (diario) + todo el histórico (mensual)
 */
import { SNAPSHOT_KEYS } from "@aviles/core";
import { snapshots } from "@aviles/db/schema";
import type { DB } from "@aviles/db/web";
import { eq } from "drizzle-orm";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/** Los datos cambian como mucho una vez por hora: caché de 5 min en el navegador y en la CDN */
const CACHE = "public, max-age=300";

function json(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function keyFor(pathname: string): string | null {
  if (pathname === "/api/status") return SNAPSHOT_KEYS.status;
  const m = /^\/api\/stations\/([^/]+)\/(recent|history)$/.exec(pathname);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  if (!/^[a-z0-9-]+:[A-Za-z0-9_-]+$/.test(id)) return null;
  return m[2] === "recent" ? SNAPSHOT_KEYS.recent(id) : SNAPSHOT_KEYS.history(id);
}

export async function handleApi(req: Request, db: DB): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json('{"error":"method not allowed"}', 405);

  const key = keyFor(new URL(req.url).pathname);
  if (!key) return json('{"error":"not found"}', 404);

  const [row] = await db.select({ json: snapshots.json }).from(snapshots).where(eq(snapshots.key, key));
  if (!row) return json('{"error":"no data"}', 404);
  return json(row.json, 200, { "Cache-Control": CACHE });
}
