import { measurements, stations, stationStatus, subscriptions } from "@aviles/db/schema";
import type { DB } from "@aviles/db/web";
import type { DetailRow, StatusRow } from "@aviles/telegram";
import { and, desc, eq, gte } from "drizzle-orm";

const CHANNEL = "telegram";

export interface StationItem {
  id: string;
  name: string;
  zone: string;
  zoneName: string;
}

/**
 * Consultas del bot. Recibe la BD como parámetro para funcionar igual en local
 * (fichero SQLite) y en Cloudflare Workers (Turso por HTTP).
 */
export function createData(db: DB) {
  /**
   * Estaciones con datos en los últimos 7 días (las que no reportan no se ofrecen).
   * Se consulta station_status (una fila por estación) en vez de las medidas: con Turso
   * se paga por filas leídas, y esto lee ~25 filas en vez de miles.
   */
  async function listStations(): Promise<StationItem[]> {
    const since = new Date(Date.now() - 7 * 24 * 3600_000);
    const rows = await db
      .select({ id: stations.id, name: stations.name, meta: stations.meta })
      .from(stationStatus)
      .innerJoin(stations, eq(stationStatus.stationId, stations.id))
      .where(gte(stationStatus.observedAt, since))
      .orderBy(stations.name);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      zone: String(r.meta?.zone ?? "otras"),
      zoneName: String(r.meta?.zoneName ?? "Otras"),
    }));
  }

  async function getSubscriptions(chatId: string) {
    return db
      .select({ id: subscriptions.id, stationId: subscriptions.stationId, stationName: stations.name })
      .from(subscriptions)
      .leftJoin(stations, eq(subscriptions.stationId, stations.id))
      .where(and(eq(subscriptions.channel, CHANNEL), eq(subscriptions.recipient, chatId)));
  }

  async function unsubscribeAll(chatId: string): Promise<number> {
    const rows = await db
      .delete(subscriptions)
      .where(and(eq(subscriptions.channel, CHANNEL), eq(subscriptions.recipient, chatId)))
      .returning({ id: subscriptions.id });
    return rows.length;
  }

  /**
   * Suscribe a una estación (o a todas, con stationId = null).
   * Suscribirse a "todas" sustituye las suscripciones sueltas para no recibir avisos duplicados.
   * Devuelve false si ya existía.
   */
  async function subscribe(chatId: string, stationId: string | null): Promise<boolean> {
    const current = await getSubscriptions(chatId);
    if (current.some((s) => s.stationId === null)) return false; // ya recibe todas
    if (stationId && current.some((s) => s.stationId === stationId)) return false;

    if (stationId === null) await unsubscribeAll(chatId);
    await db.insert(subscriptions).values({ channel: CHANNEL, recipient: chatId, stationId });
    return true;
  }

  /** Suscribe a todas las estaciones de una zona; devuelve cuántas se han añadido. */
  async function subscribeZone(chatId: string, zone: string): Promise<number> {
    const current = await getSubscriptions(chatId);
    if (current.some((s) => s.stationId === null)) return 0;
    const have = new Set(current.map((s) => s.stationId));
    const toAdd = (await listStations()).filter((s) => s.zone === zone && !have.has(s.id));
    if (toAdd.length) {
      await db
        .insert(subscriptions)
        .values(toAdd.map((s) => ({ channel: CHANNEL, recipient: chatId, stationId: s.id })));
    }
    return toAdd.length;
  }

  /** Estado actual (nivel del índice) de cada estación con datos en las últimas 48 h. */
  async function currentStatus(): Promise<StatusRow[]> {
    const since = new Date(Date.now() - 48 * 3600_000);
    const rows = await db
      .select({
        stationId: stationStatus.stationId,
        stationName: stations.name,
        meta: stations.meta,
        level: stationStatus.level,
        metric: stationStatus.metric,
        value: stationStatus.value,
        unit: stationStatus.unit,
        observedAt: stationStatus.observedAt,
      })
      .from(stationStatus)
      .innerJoin(stations, eq(stationStatus.stationId, stations.id))
      .where(gte(stationStatus.observedAt, since));
    return rows.map(({ meta, ...r }) => ({
      ...r,
      zone: String(meta?.zone ?? ""),
      zoneName: String(meta?.zoneName ?? "Otras"),
    }));
  }

  /** Último valor de cada contaminante de una estación (últimas 48 h). */
  async function stationDetail(
    stationId: string,
  ): Promise<{ name: string; zoneName: string; rows: DetailRow[] } | null> {
    const [station] = await db
      .select({ name: stations.name, meta: stations.meta })
      .from(stations)
      .where(eq(stations.id, stationId));
    if (!station) return null;

    const since = new Date(Date.now() - 48 * 3600_000);
    const all = await db
      .select({
        metric: measurements.metric,
        value: measurements.value,
        unit: measurements.unit,
        observedAt: measurements.observedAt,
      })
      .from(measurements)
      .where(and(eq(measurements.stationId, stationId), gte(measurements.observedAt, since)))
      .orderBy(desc(measurements.observedAt));

    const seen = new Set<string>();
    const rows = all.filter((r) => !seen.has(r.metric) && seen.add(r.metric));
    return { name: station.name, zoneName: String(station.meta?.zoneName ?? ""), rows };
  }

  return {
    listStations,
    getSubscriptions,
    subscribe,
    subscribeZone,
    unsubscribeAll,
    currentStatus,
    stationDetail,
  };
}

export type BotData = ReturnType<typeof createData>;
