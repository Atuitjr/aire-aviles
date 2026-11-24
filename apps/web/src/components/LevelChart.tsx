import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { EAQI, classify } from "@aviles/core";
import { fmtNum } from "../lib/format.ts";
import { LEVELS } from "../lib/levels.ts";

export interface ChartPoint {
  /** epoch en segundos */
  t: number;
  v: number;
  /** valor secundario opcional (p. ej. máximo diario) que se muestra en el tooltip y la tabla */
  max?: number;
}

interface Props {
  title: string;
  points: ChartPoint[];
  metric: string;
  unit: string;
  /** Pintar las bandas del índice (solo tiene sentido con valores horarios) */
  bands?: boolean;
  /** Formato del eje X y del tooltip */
  tickFormat: (t: number) => string;
  pointFormat: (t: number) => string;
  /** Texto del valor principal en tooltip y tabla ("Media", "Valor"...) */
  valueLabel?: string;
  height?: number;
  /** Posiciones de las marcas del eje X; por defecto, repartidas a lo ancho */
  xTicks?: (t0: number, t1: number) => number[];
}

const M = { top: 10, right: 12, bottom: 28, left: 42 };

/** Ticks "bonitos" entre 0 y max */
function niceTicks(max: number, count = 4): number[] {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

export default function LevelChart({
  title,
  points,
  metric,
  unit,
  bands = false,
  tickFormat,
  pointFormat,
  valueLabel = "Valor",
  height = 200,
  xTicks: xTicksFn,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();

  useLayoutEffect(() => {
    if (!wrap.current) return;
    const measure = (w: number) => setWidth(Math.max(280, Math.floor(w)));
    measure(wrap.current.clientWidth);
    const ro = new ResizeObserver(([e]) => measure(e.contentRect.width));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const boundaries = bands ? EAQI.bands[metric] : undefined;

  const geo = useMemo(() => {
    const iw = width - M.left - M.right;
    const ih = height - M.top - M.bottom;
    if (!points.length) return null;

    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const maxV = Math.max(...points.map((p) => p.v));

    // Eje Y: si hay bandas, como mínimo hasta el final de "Razonablemente buena" y acabando en un límite de banda
    let yMax = Math.max(maxV * 1.1, 1);
    if (boundaries) {
      const floor = Math.max(yMax, boundaries[1]);
      yMax = boundaries.find((b) => b >= floor) ?? floor;
    }
    const ticks = niceTicks(yMax);
    yMax = Math.max(yMax, ticks[ticks.length - 1]);

    const x = (t: number) => M.left + (t1 === t0 ? iw / 2 : ((t - t0) / (t1 - t0)) * iw);
    const y = (v: number) => M.top + ih - (v / yMax) * ih;

    // Línea con huecos donde faltan datos
    const steps = points.slice(1).map((p, i) => p.t - points[i].t).sort((a, b) => a - b);
    const typical = steps[Math.floor(steps.length / 2)] ?? 3600;
    let d = "";
    points.forEach((p, i) => {
      const gap = i > 0 && p.t - points[i - 1].t > typical * 1.5;
      d += `${i === 0 || gap ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
    });

    const xTickCount = Math.max(2, Math.min(7, Math.floor(iw / 110)));
    const xTicks = xTicksFn
      ? xTicksFn(t0, t1).filter((t) => t >= t0 && t <= t1)
      : Array.from({ length: xTickCount }, (_, i) => t0 + ((t1 - t0) * i) / (xTickCount - 1));

    const bandRects = boundaries
      ? LEVELS.map((lv, i) => {
          const lo = i === 0 ? 0 : boundaries[i - 1];
          const hi = i < boundaries.length ? boundaries[i] : Infinity;
          if (lo >= yMax) return null;
          const top = y(Math.min(hi, yMax));
          const bottom = y(lo);
          return { i, label: lv.label, top, h: bottom - top };
        }).filter((b): b is NonNullable<typeof b> => !!b)
      : [];

    return { iw, ih, x, y, d, ticks, xTicks, bandRects, t0, t1 };
  }, [points, width, height, boundaries, xTicksFn]);

  if (!geo) {
    return (
      <figure className="grafica vacia">
        <figcaption>
          <h3>{title}</h3>
        </figcaption>
        <p className="nota">No hay datos para este periodo.</p>
      </figure>
    );
  }

  const nearest = (px: number) => {
    const t = geo.t0 + ((px - M.left) / geo.iw) * (geo.t1 - geo.t0);
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid].t < t) lo = mid;
      else hi = mid;
    }
    return Math.abs(points[lo].t - t) <= Math.abs(points[hi].t - t) ? lo : hi;
  };

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    setActive(nearest(e.clientX - rect.left));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const last = points.length - 1;
    const cur = active ?? last;
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? last : Math.min(last, Math.max(0, cur + (e.key === "ArrowLeft" ? -1 : 1)));
    setActive(next);
  };

  const ap = active !== null ? points[active] : null;
  const apLevel = ap && boundaries ? classify(EAQI, metric, ap.v) : null;
  const tipLeft = ap ? Math.min(Math.max(geo.x(ap.t) - 80, 0), width - 170) : 0;

  const last = points[points.length - 1];
  const summary = `${title}. ${points.length} valores entre ${pointFormat(points[0].t)} y ${pointFormat(last.t)}. Máximo: ${fmtNum(
    Math.max(...points.map((p) => p.v)),
  )} ${unit}. Último: ${fmtNum(last.v)} ${unit}.`;

  return (
    <figure className="grafica">
      <figcaption>
        <h3>{title}</h3>
        <span className="nota">{unit}</span>
      </figcaption>

      <div
        ref={wrap}
        className="lienzo"
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        aria-label={`${summary} Usa las flechas para recorrer los valores.`}
        role="img"
      >
        <svg width={width} height={height} aria-hidden="true">
          {geo.bandRects.map((b) => (
            <g key={b.i}>
              <rect
                x={M.left}
                y={b.top}
                width={geo.iw}
                height={b.h}
                fill={`var(--nivel-${b.i})`}
                style={{ opacity: "var(--banda-opacidad)" }}
              />
              {b.h >= 16 && (
                <text x={M.left + 6} y={b.top + 13} className="banda-etiqueta">
                  {b.label}
                </text>
              )}
            </g>
          ))}

          {geo.ticks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={M.left + geo.iw} y1={geo.y(v)} y2={geo.y(v)} className={v === 0 ? "base" : "rejilla"} />
              <text x={M.left - 8} y={geo.y(v) + 4} textAnchor="end" className="eje">
                {fmtNum(v)}
              </text>
            </g>
          ))}

          {geo.xTicks.map((t, i) => (
            <text
              key={t}
              x={geo.x(t)}
              y={height - 8}
              textAnchor={
                xTicksFn ? "middle" : i === 0 ? "start" : i === geo.xTicks.length - 1 ? "end" : "middle"
              }
              className="eje"
            >
              {tickFormat(t)}
            </text>
          ))}

          <path d={geo.d} className="serie" />

          {ap && (
            <g>
              <line x1={geo.x(ap.t)} x2={geo.x(ap.t)} y1={M.top} y2={M.top + geo.ih} className="cruz" />
              <circle cx={geo.x(ap.t)} cy={geo.y(ap.v)} r={5} className="punto" />
            </g>
          )}

          <rect
            x={M.left}
            y={M.top}
            width={geo.iw}
            height={geo.ih}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
          />
        </svg>

        {ap && (
          <div className="tooltip" style={{ left: tipLeft }} aria-live="polite">
            <strong>
              {fmtNum(ap.v)} {unit}
            </strong>
            {ap.max !== undefined && (
              <span>
                Máximo: {fmtNum(ap.max)} {unit}
              </span>
            )}
            {apLevel !== null && <span>{LEVELS[apLevel].label}</span>}
            <span className="nota">{pointFormat(ap.t)}</span>
          </div>
        )}
      </div>

      <details className="tabla">
        <summary>Ver los datos en una tabla</summary>
        <div className="tabla-scroll" id={tableId}>
          <table>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">
                  {valueLabel} ({unit})
                </th>
                {points.some((p) => p.max !== undefined) && <th scope="col">Máximo ({unit})</th>}
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.t}>
                  <td>{pointFormat(p.t)}</td>
                  <td>{fmtNum(p.v)}</td>
                  {p.max !== undefined && <td>{fmtNum(p.max)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
