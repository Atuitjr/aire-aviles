import { Router } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, stations, measurements } from "@aviles/db";

export const stationsRouter = Router();

/** GET /stations — todas las estaciones */
stationsRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(stations);
  res.json(rows);
});

/** GET /stations/:id/latest — último valor de cada métrica */
stationsRouter.get("/:id/latest", async (req, res) => {
  const rows = await db
    .select()
    .from(measurements)
    .where(eq(measurements.stationId, req.params.id))
    .orderBy(desc(measurements.observedAt))
    .limit(200);

  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.metric)) latest.set(r.metric, r);
  res.json([...latest.values()]);
});

/** GET /stations/:id/history?metric=PM10&hours=48 */
stationsRouter.get("/:id/history", async (req, res) => {
  const metric = typeof req.query.metric === "string" ? req.query.metric : undefined;
  const hours = Math.min(Number(req.query.hours ?? 48) || 48, 24 * 31);
  const from = new Date(Date.now() - hours * 3600_000);

  const conditions = [eq(measurements.stationId, req.params.id), gte(measurements.observedAt, from)];
  if (metric) conditions.push(eq(measurements.metric, metric));

  const rows = await db
    .select()
    .from(measurements)
    .where(and(...conditions))
    .orderBy(measurements.observedAt);
  res.json(rows);
});
