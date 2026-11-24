import { useEffect, useMemo, useState } from "react";
import type { HistorySnapshot, RecentSnapshot, StationStatusSnapshot } from "@aviles/core";
import { BOT_URL } from "../config.ts";
import { fetchHistory, fetchRecent, fetchStatus } from "../lib/api.ts";
import { fmtAgo, fmtDay, fmtDayTime, fmtIsoDay, fmtIsoMonth, fmtNum, fmtTime } from "../lib/format.ts";
import { LEVELS, METRIC_NAME, METRIC_SHORT, isIndexMetric, levelPhrase, metricRank } from "../lib/levels.ts";
import LevelChart, { type ChartPoint } from "./LevelChart.tsx";
import LevelChip from "./LevelChip.tsx";

interface Props {
  stationId: string;
  name: string;
  zoneName: string;
}

const dayToEpoch = (d: string) => Date.parse(`${d}T12:00:00Z`) / 1000;
const monthToEpoch = (m: string) => Date.parse(`${m}-15T12:00:00Z`) / 1000;
const isoFromEpoch = (t: number) => new Date(t * 1000).toISOString();
const yearOf = (t: number) => isoFromEpoch(t).slice(0, 4);
const monthShort = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", month: "short", year: "2-digit" });

/** Marcas del eje X el día 1 de cada mes (saltando meses si no caben) */
function monthTicks(t0: number, t1: number): number[] {
  const d = new Date(t0 * 1000);
  const out: number[] = [];
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1;
  while (true) {
    if (m > 11) { m = 0; y++; }
    const t = Date.UTC(y, m, 1) / 1000;
    if (t > t1) break;
    out.push(t);
    m += 2;
  }
  return out;
}

/** Marcas del eje X a mitad de cada año (la etiqueta es el año) */
function yearTicks(t0: number, t1: number): number[] {
  const out: number[] = [];
  for (let y = new Date(t0 * 1000).getUTCFullYear(); y <= new Date(t1 * 1000).getUTCFullYear(); y++) out.push(Date.UTC(y, 6, 1) / 1000);
  return out;
}

export default function StationView({ stationId, name, zoneName }: Props) {
  const [status, setStatus] = useState<StationStatusSnapshot | null | undefined>(undefined);
  const [recent, setRecent] = useState<RecentSnapshot | null>(null);
  const [history, setHistory] = useState<HistorySnapshot | null>(null);
  const [metric, setMetric] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchStatus().then(
      (s) => setStatus(s.stations.find((x) => x.id === stationId) ?? null),
      () => setError(true),
    );
    fetchRecent(stationId).then(setRecent, () => setRecent({ stationId, generatedAt: 0, series: {} }));
    fetchHistory(stationId).then(setHistory, () => setHistory({ stationId, generatedAt: 0, daily: {}, monthly: {} }));
  }, [stationId]);

  const metrics = useMemo(() => {
    const all = new Set([
      ...Object.keys(status?.latest ?? {}),
      ...Object.keys(recent?.series ?? {}),
      ...Object.keys(history?.monthly ?? {}),
    ]);
    return [...all].sort((a, b) => metricRank(a) - metricRank(b));
  }, [status, recent, history]);

  // Por defecto, el contaminante que marca el nivel de la estación
  const selected = metric ?? (status?.metric && metrics.includes(status.metric) ? status.metric : metrics[0]) ?? null;

  if (error) return <p>No se han podido cargar los datos. Vuelve a intentarlo en unos minutos.</p>;
  if (status === undefined) return <p className="secundario">Cargando los datos de {name}…</p>;

  const latest = Object.entries(status?.latest ?? {}).sort(([a], [b]) => metricRank(a) - metricRank(b));

  const recentPoints: ChartPoint[] = selected && recent?.series[selected]
    ? recent.series[selected].t.map((t, i) => ({ t, v: recent.series[selected].v[i] }))
    : [];
  const dailySeries = selected ? history?.daily[selected] : undefined;
  const dailyPoints: ChartPoint[] = dailySeries
    ? dailySeries.labels.map((d, i) => ({ t: dayToEpoch(d), v: dailySeries.mean[i], max: dailySeries.max[i] }))
    : [];
  const monthlySeries = selected ? history?.monthly[selected] : undefined;
  const monthlyPoints: ChartPoint[] = monthlySeries
    ? monthlySeries.labels.map((m, i) => ({ t: monthToEpoch(m), v: monthlySeries.mean[i], max: monthlySeries.max[i] }))
    : [];
  const unit =
    (selected && (recent?.series[selected]?.unit ?? dailySeries?.unit ?? monthlySeries?.unit ?? status?.latest[selected]?.unit)) || "";
  const firstYear = monthlyPoints.length ? yearOf(monthlyPoints[0].t) : null;

  return (
    <div className="estacion">
      <section className="cabeza" aria-labelledby="nombre">
        <p className="secundario">Estación de la zona de {zoneName}</p>
        <h1 id="nombre">{name}</h1>
        {status ? (
          <>
            <p className="estado">
              <LevelChip level={status.level} /> {levelPhrase(status.level)}.
            </p>
            <p className="secundario">
              Lo marca {METRIC_NAME[status.metric] ?? status.metric}, con {fmtNum(status.value)} {status.unit}. Datos de las{" "}
              {fmtTime(status.t)}, {fmtAgo(status.t)}.
            </p>
            {status.level >= 2 && (
              <div className="consejo">
                <p>{LEVELS[status.level].advice}</p>
                <p className="secundario">Personas sensibles: {LEVELS[status.level].adviceSensitive}</p>
              </div>
            )}
          </>
        ) : (
          <p className="secundario">Esta estación no ha enviado datos en las últimas 48 horas.</p>
        )}
      </section>

      {latest.length > 0 && (
        <section aria-labelledby="ahora-titulo">
          <h2 id="ahora-titulo">Últimos valores</h2>
          <table className="valores">
            <thead>
              <tr>
                <th scope="col">Contaminante</th>
                <th scope="col">Valor</th>
                <th scope="col">Nivel</th>
              </tr>
            </thead>
            <tbody>
              {latest.map(([m, v]) => (
                <tr key={m}>
                  <th scope="row">{METRIC_NAME[m] ?? m}</th>
                  <td>
                    {fmtNum(v.value)} {v.unit}
                  </td>
                  <td>
                    <LevelChip level={v.level} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {metrics.length > 0 && selected && (
        <section className="evolucion" aria-labelledby="evolucion-titulo">
          <h2 id="evolucion-titulo">Evolución</h2>
          <div className="segmentos" role="group" aria-label="Contaminante">
            {metrics.map((m) => (
              <button key={m} type="button" aria-pressed={m === selected} onClick={() => setMetric(m)}>
                {METRIC_SHORT[m] ?? m}
              </button>
            ))}
          </div>
          {!isIndexMetric(selected) && (
            <p className="nota">
              {METRIC_NAME[selected] ?? selected} no forma parte del índice europeo, así que no tiene niveles de color.
            </p>
          )}

          <LevelChart
            key={`r-${selected}`}
            title="Últimos 14 días, hora a hora"
            points={recentPoints}
            metric={selected}
            unit={unit}
            bands={isIndexMetric(selected)}
            tickFormat={fmtDay}
            pointFormat={fmtDayTime}
          />
          <LevelChart
            key={`d-${selected}`}
            title="Último año, media diaria"
            points={dailyPoints}
            metric={selected}
            unit={unit}
            tickFormat={(t) => monthShort.format(new Date(t * 1000))}
            xTicks={monthTicks}
            pointFormat={(t) => fmtIsoDay(isoFromEpoch(t).slice(0, 10))}
            valueLabel="Media"
          />
          <LevelChart
            key={`m-${selected}`}
            title={firstYear ? `Desde ${firstYear}, media mensual` : "Histórico, media mensual"}
            points={monthlyPoints}
            metric={selected}
            unit={unit}
            tickFormat={yearOf}
            xTicks={yearTicks}
            pointFormat={(t) => fmtIsoMonth(isoFromEpoch(t).slice(0, 7))}
            valueLabel="Media"
          />
          <p className="nota">
            Las bandas de color solo aparecen en la gráfica horaria: los niveles del índice se definen sobre valores de una
            hora, no sobre medias diarias o mensuales.
          </p>
        </section>
      )}

      <section className="avisos-cta" aria-labelledby="avisos-titulo">
        <h2 id="avisos-titulo">Avisos de {name} en Telegram</h2>
        <p className="secundario">
          El bot te escribe cuando la calidad del aire llega a <i>desfavorable</i> en las estaciones que elijas, y cuando el
          episodio termina.
        </p>
        <a className="boton" href={BOT_URL} rel="noopener">
          Abrir el bot en Telegram
        </a>
      </section>

      <style>{`
        .estacion { display: grid; gap: 3.5rem; }
        .estacion > *, .evolucion > * { min-width: 0; }
        .cabeza { display: grid; gap: 0.6rem; }
        .cabeza h1 { margin-bottom: 0.25rem; }
        .estado { font-size: var(--t1); font-weight: 650; display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
        .consejo { border-left: 4px solid var(--tinta); padding: 0.2rem 0 0.2rem 1rem; display: grid; gap: 0.3rem; margin-top: 0.5rem; }
        .valores { border-collapse: collapse; margin-top: 1rem; width: 100%; max-width: 40rem; }
        .valores th, .valores td { text-align: left; padding: 0.55rem 1rem 0.55rem 0; border-bottom: 1px solid var(--linea); }
        .valores thead th { font-size: var(--t-1); color: var(--tinta-2); font-weight: 600; }
        .valores tbody th { font-weight: 600; }
        .evolucion { display: grid; gap: 1.5rem; }
        .avisos-cta { display: grid; gap: 0.75rem; justify-items: start; border-top: 1px solid var(--linea); padding-top: 2rem; }
        .boton { display: inline-block; background: var(--tinta); color: var(--niebla); font-weight: 700; padding: 0.6rem 1.1rem; border-radius: 999px; text-decoration: none; }
        .boton:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
