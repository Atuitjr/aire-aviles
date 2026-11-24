/**
 * Lista todas las estaciones de Asturias que publican datos en la EEA:
 * nombre (si está en la tabla del BOPA), contaminantes y último dato válido de cada uno.
 *
 *   npm run probe:stations
 */
import { readParquet } from "./api.ts";
import { asturiasUrls, mapLimit } from "./index.ts";
import { mapRow } from "./parse.ts";
import { STATION_BY_CODE } from "./stations.ts";

const fmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const end = new Date();
const start = new Date(end.getTime() - 72 * 3600_000);
console.log("Pidiendo la lista de ficheros de España…");
const files = await asturiasUrls(start, end);
console.log(`${files.length} ficheros de Asturias. Descargando…\n`);

type Info = { metric: string; last: Date | null; value?: number };
const results = await mapLimit(files, 8, async ({ url, code }) => {
  try {
    const rows = await readParquet(url);
    for (let i = rows.length - 1; i >= 0; i--) {
      const m = mapRow("x", rows[i]);
      if (m) return { code, info: { metric: m.metric, last: m.observedAt, value: m.value } as Info };
    }
    return { code, info: { metric: `contaminante ${String(rows.at(-1)?.Pollutant ?? "?")}`, last: null } as Info };
  } catch (err) {
    return { code, info: { metric: `error: ${(err as Error).message}`, last: null } as Info };
  }
});

const byCode = new Map<string, Info[]>();
for (const r of results) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r.info]);

// Estaciones sin ficheros ni con su código ni con sus alias
const missing = [...new Set(STATION_BY_CODE.values())]
  .filter((s) => ![s.meta!.code as string, ...((s.meta!.aliases as string[] | undefined) ?? [])].some((c) => byCode.has(c)))
  .map((s) => s.meta!.code as string);
const zones = new Map<string, string[]>();
for (const [code, infos] of [...byCode].sort()) {
  const st = STATION_BY_CODE.get(code);
  const zone = (st?.meta?.zoneName as string) ?? "SIN REGISTRAR";
  const recent = infos.filter((i) => i.last && end.getTime() - i.last.getTime() < 24 * 3600_000);
  const newest = infos.reduce<Date | null>((a, i) => (i.last && (!a || i.last > a) ? i.last : a), null);
  const line =
    `  ${code}  ${(st?.name ?? "¿?").padEnd(24)} ` +
    `último: ${newest ? fmt.format(newest) : "—"}  ` +
    `activos: ${recent.map((i) => i.metric).sort().join(", ") || "ninguno"}` +
    (infos.length > recent.length ? `  (sin datos recientes: ${infos.length - recent.length})` : "");
  zones.set(zone, [...(zones.get(zone) ?? []), line]);
}

for (const [zone, lines] of zones) console.log(`${zone}\n${lines.join("\n")}\n`);
if (missing.length) {
  console.log("Estaciones del BOPA sin ficheros en la EEA:");
  for (const c of missing) console.log(`  ${c}  ${STATION_BY_CODE.get(c)!.name}`);
}
console.log(`\nHora actual: ${fmt.format(end)}`);
