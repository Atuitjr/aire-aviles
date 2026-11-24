const TZ = "Europe/Madrid";

const timeFmt = new Intl.DateTimeFormat("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("es-ES", { timeZone: TZ, day: "numeric", month: "short" });
const dayTimeFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const fullDayFmt = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const monthFmt = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", month: "long", year: "numeric" });

/** Epoch en segundos → "13:00" */
export const fmtTime = (t: number) => timeFmt.format(new Date(t * 1000));
/** Epoch en segundos → "24 nov" */
export const fmtDay = (t: number) => dayFmt.format(new Date(t * 1000));
/** Epoch en segundos → "lun, 24 nov, 13:00" */
export const fmtDayTime = (t: number) => dayTimeFmt.format(new Date(t * 1000));
/** "2025-01-31" → "31 de enero de 2025" */
export const fmtIsoDay = (d: string) => fullDayFmt.format(new Date(`${d}T12:00:00Z`));
/** "2025-01" → "enero de 2025" */
export const fmtIsoMonth = (m: string) => monthFmt.format(new Date(`${m}-15T12:00:00Z`));

/** "hace 3 h" / "hace 40 min" */
export function fmtAgo(t: number, now = Date.now() / 1000): string {
  const min = Math.max(0, Math.round((now - t) / 60));
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

const num = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
export const fmtNum = (v: number) => num.format(v);

/** "Jardín de Cantos" → "jardin-de-cantos" */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
