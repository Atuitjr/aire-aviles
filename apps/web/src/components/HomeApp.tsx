import { useEffect, useMemo, useState } from "react";
import type { StationStatusSnapshot, StatusSnapshot } from "@aviles/core";
import { DEFAULT_ZONE, ZONE_ORDER } from "../config.ts";
import { fetchStatus } from "../lib/api.ts";
import { fmtAgo, fmtNum, fmtTime, slugify } from "../lib/format.ts";
import { METRIC_SHORT, levelPhrase } from "../lib/levels.ts";
import LevelChip from "./LevelChip.tsx";
import LevelRuler from "./LevelRuler.tsx";
import StationMap from "./StationMap.tsx";

const zoneRank = (z: string) => ZONE_ORDER.indexOf(z) + 1 || 99;

export default function HomeApp() {
  const [data, setData] = useState<StatusSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [zone, setZone] = useState(DEFAULT_ZONE);

  useEffect(() => {
    fetchStatus().then(setData, () => setError(true));
  }, []);

  const zones = useMemo(() => {
    const map = new Map<string, { zone: string; zoneName: string; stations: StationStatusSnapshot[] }>();
    for (const s of data?.stations ?? []) {
      const z = map.get(s.zone) ?? { zone: s.zone, zoneName: s.zoneName, stations: [] };
      z.stations.push(s);
      map.set(s.zone, z);
    }
    for (const z of map.values()) z.stations.sort((a, b) => a.name.localeCompare(b.name, "es"));
    return [...map.values()].sort((a, b) => zoneRank(a.zone) - zoneRank(b.zone));
  }, [data]);

  if (error) {
    return (
      <div className="contenedor">
        <p>No se han podido cargar los datos. Vuelve a intentarlo en unos minutos.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="contenedor" aria-busy="true">
        <p className="secundario">Cargando el estado de las estaciones…</p>
      </div>
    );
  }

  const current = zones.find((z) => z.zone === zone) ?? zones[0];
  if (!current) {
    return (
      <div className="contenedor">
        <p>Todavía no hay datos de ninguna estación.</p>
      </div>
    );
  }

  const worst = current.stations.reduce((a, b) => (b.level > a.level ? b : a));
  const sameLevel = current.stations.filter((s) => s.level === worst.level).length;
  const newest = Math.max(...current.stations.map((s) => s.t));

  return (
    <>
      <section className="contenedor portada" aria-labelledby="titular">
        <div className="segmentos" role="group" aria-label="Zona">
          {zones.map((z) => (
            <button key={z.zone} type="button" aria-pressed={z.zone === current.zone} onClick={() => setZone(z.zone)}>
              {z.zoneName}
            </button>
          ))}
        </div>

        <h1 id="titular">
          {levelPhrase(worst.level)} en {current.zoneName}
        </h1>
        <p className="secundario resumen">
          {sameLevel === current.stations.length
            ? `Las ${current.stations.length} estaciones de la zona están en el mismo nivel.`
            : `El peor nivel lo marca ${worst.name}, por ${METRIC_SHORT[worst.metric] ?? worst.metric} (${fmtNum(worst.value)} ${worst.unit}).`}{" "}
          Datos de las {fmtTime(newest)}, {fmtAgo(newest)}.
        </p>

        <LevelRuler stations={current.stations} />
      </section>

      <section className="contenedor bloque" aria-labelledby="mapa-titulo">
        <h2 id="mapa-titulo">Todas las estaciones de Asturias</h2>
        <StationMap stations={data.stations} />
      </section>

      <section className="contenedor bloque" aria-labelledby="lista-titulo">
        <h2 id="lista-titulo">Por zonas</h2>
        <div className="zonas">
          {zones.map((z) => (
            <div key={z.zone} className="zona">
              <h3>{z.zoneName}</h3>
              <ul>
                {z.stations.map((s) => (
                  <li key={s.id}>
                    <a href={`/estacion/${slugify(s.name)}/`}>{s.name}</a>
                    <LevelChip level={s.level} />
                    <span className="nota">
                      {METRIC_SHORT[s.metric] ?? s.metric} {fmtNum(s.value)} {s.unit}, {fmtTime(s.t)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .portada { display: grid; gap: 1.25rem; }
        .portada h1 { max-width: 22ch; margin-top: 0.75rem; }
        .resumen { font-size: var(--t1); line-height: 1.45; }
        .bloque { margin-top: 4rem; display: grid; gap: 1.25rem; }
        .zonas { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); gap: 2rem 2.5rem; }
        .zona ul { list-style: none; margin: 0.75rem 0 0; padding: 0; }
        .zona li {
          display: grid; grid-template-columns: 1fr auto; column-gap: 0.75rem; row-gap: 0.15rem;
          padding-block: 0.6rem; border-top: 1px solid var(--linea);
        }
        .zona li a { font-weight: 650; }
        .zona li .nota { grid-column: 1 / -1; }
      `}</style>
    </>
  );
}

