import { classify, EAQI, stationLevel, type Alert } from "@aviles/core";

/** Escapa texto para parse_mode=HTML de Telegram */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const timeFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtTime(d: Date): string {
  return timeFmt.format(d);
}

/** Nombres legibles de las magnitudes */
export const METRIC_LABEL: Record<string, string> = {
  PM10: "partículas PM10",
  "PM2.5": "partículas finas PM2.5",
  NO2: "dióxido de nitrógeno (NO₂)",
  SO2: "dióxido de azufre (SO₂)",
  O3: "ozono (O₃)",
  CO: "monóxido de carbono (CO)",
  BENCENO: "benceno",
  NO: "monóxido de nitrógeno (NO)",
  NOx: "óxidos de nitrógeno (NOx)",
};

const metricLabel = (m: string) => METRIC_LABEL[m] ?? m;

export function formatAlert(alert: Alert, stationName: string): string {
  const { levelInfo: lv } = alert;
  const name = esc(stationName);
  const cause = `Causa: ${esc(metricLabel(alert.metric))}, <b>${alert.value} ${esc(alert.unit)}</b>`;
  const when = `<i>Medida de las ${fmtTime(alert.observedAt)} · dato provisional</i>`;

  if (alert.kind === "end") {
    return [`✅ <b>${name}: el episodio ha terminado</b>`, `Calidad del aire ahora: ${lv.icon} ${esc(lv.label)}`, when].join(
      "\n",
    );
  }

  const title =
    alert.kind === "start"
      ? `${lv.icon} <b>Calidad del aire ${esc(lv.label.toLowerCase())} en ${name}</b>`
      : `${lv.icon} <b>Empeora en ${name}: ${esc(lv.label.toLowerCase())}</b>`;

  return [
    title,
    cause,
    "",
    `👤 ${esc(lv.advice)}`,
    `🫁 Personas sensibles: ${esc(lv.adviceSensitive)}`,
    "",
    when,
  ].join("\n");
}

export interface StatusRow {
  stationId: string;
  stationName: string;
  zone: string;
  zoneName: string;
  level: number;
  metric: string;
  value: number;
  unit: string;
  observedAt: Date;
}

/** Orden de las zonas en los listados: Avilés primero */
export const ZONE_ORDER = ["ES0307", "ES0309", "ES0306", "ES0308", "ES0311"];
const zoneRank = (z: string) => (ZONE_ORDER.indexOf(z) + 1 || 99);

/**
 * Estado actual: una línea por estación con su nivel del índice europeo, agrupado por zona.
 * Si se pasa `zone`, solo esa zona.
 */
export function formatStatus(rows: StatusRow[], zone?: string): string {
  const list = zone ? rows.filter((r) => r.zone === zone) : rows;
  if (!list.length) return "Todavía no hay datos. ¿Está funcionando el worker?";

  const byZone = new Map<string, StatusRow[]>();
  for (const r of [...list].sort((a, b) => zoneRank(a.zone) - zoneRank(b.zone) || a.stationName.localeCompare(b.stationName))) {
    byZone.set(r.zone, [...(byZone.get(r.zone) ?? []), r]);
  }

  const blocks = [...byZone.values()].map((stations) => {
    const lines = stations.map((r) => {
      const lv = EAQI.levels[r.level];
      return `${lv.icon} <b>${esc(r.stationName)}</b> · ${esc(lv.label)} <i>(${esc(r.metric)} ${r.value})</i>`;
    });
    return `<u>${esc(stations[0].zoneName)}</u>\n${lines.join("\n")}`;
  });

  const newest = list.reduce((a, b) => (a.observedAt > b.observedAt ? a : b)).observedAt;
  return [
    blocks.join("\n\n"),
    "",
    `<i>Índice europeo de calidad del aire · datos hasta las ${fmtTime(newest)}, provisionales y con unas horas de retraso.</i>`,
  ].join("\n");
}

export interface DetailRow {
  metric: string;
  value: number;
  unit: string;
  observedAt: Date;
}

/** Orden de los contaminantes en el detalle: primero los del índice */
const METRIC_ORDER = ["PM2.5", "PM10", "NO2", "O3", "SO2", "CO", "BENCENO", "NO", "NOx"];
const metricRank = (m: string) => (METRIC_ORDER.indexOf(m) + 1 || 99);

/**
 * Detalle de una estación: último valor de cada contaminante.
 * Los que forman parte del índice europeo llevan su nivel; el resto (CO, benceno...) solo el valor.
 */
export function formatStationDetail(
  statusRow: StatusRow | undefined,
  stationName: string,
  rows: DetailRow[],
  zoneName = "",
): string {
  if (!rows.length) return `<b>${esc(stationName)}</b>\n\nNo hay datos de las últimas 48 horas.`;

  // Si la estación aún no tiene estado calculado, el nivel sale de sus medidas de la hora más reciente
  let status = statusRow;
  if (!status) {
    const newestTime = Math.max(...rows.map((r) => r.observedAt.getTime()));
    const lvl = stationLevel(EAQI, rows.filter((r) => r.observedAt.getTime() === newestTime));
    if (lvl) {
      status = {
        stationId: "",
        stationName,
        zone: "",
        zoneName,
        ...lvl,
        observedAt: new Date(newestTime),
      };
    }
  }

  const header = status
    ? `${EAQI.levels[status.level].icon} <b>${esc(stationName)}</b> · ${esc(EAQI.levels[status.level].label)}`
    : `⚪ <b>${esc(stationName)}</b>`;

  const lines = [...rows]
    .sort((a, b) => metricRank(a.metric) - metricRank(b.metric))
    .map((r) => {
      const level = classify(EAQI, r.metric, r.value);
      const tag = level === null ? "▫️" : EAQI.levels[level].icon;
      const name = METRIC_LABEL[r.metric] ?? r.metric;
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      return `${tag} ${esc(label)}: <b>${r.value} ${esc(r.unit)}</b>`;
    });

  const newest = rows.reduce((a, b) => (a.observedAt > b.observedAt ? a : b)).observedAt;
  // A partir de "Regular" se muestran las recomendaciones; por debajo, una línea corta
  const advice = !status
    ? []
    : status.level >= 2
      ? ["", `👤 ${esc(EAQI.levels[status.level].advice)}`, `🫁 Personas sensibles: ${esc(EAQI.levels[status.level].adviceSensitive)}`]
      : ["", "✅ Sin recomendaciones especiales."];

  return [
    header,
    status?.zoneName ? `<i>Zona ${esc(status.zoneName)}</i>` : "",
    "",
    ...lines,
    ...advice,
    "",
    `<i>Datos hasta las ${fmtTime(newest)} · provisionales. ▫️ = no forma parte del índice europeo.</i>`,
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n");
}
