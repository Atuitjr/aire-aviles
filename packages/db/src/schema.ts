import { sqliteTable, text, real, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const stations = sqliteTable("stations", {
  id: text("id").primaryKey(), // "aviles-air:llaranes"
  sourceId: text("source_id").notNull(),
  name: text("name").notNull(),
  lat: real("lat"),
  lon: real("lon"),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
});

export const measurements = sqliteTable(
  "measurements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stationId: text("station_id")
      .notNull()
      .references(() => stations.id),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    observedAt: integer("observed_at", { mode: "timestamp" }).notNull(),
    provisional: integer("provisional", { mode: "boolean" }).notNull().default(false),
    ingestedAt: integer("ingested_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // Evita duplicados al reingerir la misma ventana de datos
    uniqueIndex("measurements_unique").on(t.stationId, t.metric, t.observedAt),
    index("measurements_station_time").on(t.stationId, t.observedAt),
  ],
);

/** Suscripciones: quién quiere qué avisos y por qué canal */
export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channel: text("channel").notNull(), // "telegram" | "webpush" | "email"
  recipient: text("recipient").notNull(), // chat_id, endpoint, email...
  stationId: text("station_id").references(() => stations.id), // null = todas
  metric: text("metric"), // null = todas
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Estado actual de cada estación respecto a su índice: nivel de la última hora
 * y episodio en curso. Es lo que evita repetir avisos hora tras hora.
 */
export const stationStatus = sqliteTable("station_status", {
  stationId: text("station_id")
    .primaryKey()
    .references(() => stations.id),
  indexId: text("index_id").notNull(),
  /** Nivel de la última hora evaluada y magnitud que lo determina */
  level: integer("level").notNull(),
  metric: text("metric").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  observedAt: integer("observed_at", { mode: "timestamp" }).notNull(),
  /** Episodio: desde cuándo, nivel máximo y último nivel avisado (0 = sin avisar) */
  episodeStart: integer("episode_start", { mode: "timestamp" }),
  peakLevel: integer("peak_level").notNull().default(0),
  notifiedLevel: integer("notified_level").notNull().default(0),
  /** Horas seguidas por debajo del umbral (para cerrar el episodio sin "rebotes") */
  hoursBelow: integer("hours_below").notNull().default(0),
});

/** Historial de avisos enviados (para la web y para depurar) */
export const alertsLog = sqliteTable(
  "alerts_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(), // start | worse | end
    stationId: text("station_id")
      .notNull()
      .references(() => stations.id),
    level: integer("level").notNull(),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    observedAt: integer("observed_at", { mode: "timestamp" }).notNull(),
    recipients: integer("recipients").notNull().default(0),
    sentAt: integer("sent_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("alerts_log_station_time").on(t.stationId, t.sentAt)],
);
