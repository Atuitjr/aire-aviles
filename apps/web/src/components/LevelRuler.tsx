import type { StationStatusSnapshot } from "@aviles/core";
import { slugify } from "../lib/format.ts";
import { LEVELS, inkOn } from "../lib/levels.ts";

/**
 * La "regla" de niveles: los seis niveles del índice en orden, y cada estación colocada en el suyo.
 * En pantallas anchas es horizontal (columnas); en móvil, vertical (filas).
 */
export default function LevelRuler({ stations }: { stations: StationStatusSnapshot[] }) {
  return (
    <figure className="regla">
      <figcaption className="visualmente-oculto">
        Nivel del índice europeo de calidad del aire en cada estación de la zona
      </figcaption>
      <ol>
        {LEVELS.map((lv, i) => {
          const here = stations.filter((s) => s.level === i);
          return (
            <li key={lv.label} className={here.length ? "ocupado" : "vacio"}>
              <ul className="estaciones" aria-label={here.length ? `Estaciones en ${lv.label}` : undefined}>
                {here.map((s) => (
                  <li key={s.id}>
                    <a href={`/estacion/${slugify(s.name)}/`}>{s.name}</a>
                  </li>
                ))}
              </ul>
              <div className="barra" style={{ background: `var(--nivel-${i})`, color: inkOn(i) }}>
                {here.length > 0 && <span className="cuenta">{here.length}</span>}
              </div>
              <span className="nivel">{lv.label}</span>
            </li>
          );
        })}
      </ol>
      <style>{`
        .regla { margin: 1rem 0 0; }
        .regla > ol {
          list-style: none; margin: 0; padding: 0;
          display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px;
          align-items: end;
        }
        .regla > ol > li { display: grid; grid-template-rows: auto auto auto; align-content: end; min-width: 0; }
        .regla .estaciones {
          list-style: none; margin: 0 0 0.6rem; padding: 0 0.25rem;
          display: grid; gap: 0.2rem; font-weight: 650; line-height: 1.25;
        }
        .regla .estaciones a { text-decoration: none; }
        .regla .estaciones a:hover { text-decoration: underline; }
        .regla .barra {
          height: 3.25rem; display: flex; align-items: center; padding-inline: 0.6rem;
          font-weight: 800; font-size: var(--t1);
        }
        .regla > ol > li:first-child .barra { border-radius: var(--radio) 0 0 var(--radio); }
        .regla > ol > li:last-child .barra { border-radius: 0 var(--radio) var(--radio) 0; }
        .regla .vacio .barra { opacity: 0.35; }
        .regla .nivel { margin-top: 0.45rem; padding-inline: 0.25rem; font-size: var(--t-1); color: var(--tinta-2); line-height: 1.25; }
        .regla .ocupado .nivel { color: var(--tinta); font-weight: 650; }

        @media (max-width: 44rem) {
          .regla > ol { display: flex; flex-direction: column-reverse; align-items: stretch; gap: 3px; }
          .regla > ol > li {
            grid-template-columns: 2.75rem 1fr; grid-template-rows: auto auto;
            column-gap: 0.75rem; align-items: start; padding-block: 0.15rem;
          }
          .regla .barra { grid-row: 1 / span 2; grid-column: 1; height: 100%; min-height: 2.75rem; justify-content: center; padding: 0; border-radius: 4px !important; }
          .regla .nivel { grid-row: 1; grid-column: 2; margin: 0.35rem 0 0; padding: 0; }
          .regla .estaciones { grid-row: 2; grid-column: 2; margin: 0.15rem 0 0.35rem; padding: 0; }
        }
      `}</style>
    </figure>
  );
}
