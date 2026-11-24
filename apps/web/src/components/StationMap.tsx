import { useEffect, useRef } from "react";
import type { StationStatusSnapshot } from "@aviles/core";
import { fmtNum, slugify } from "../lib/format.ts";
import { LEVELS, METRIC_SHORT } from "../lib/levels.ts";
import "leaflet/dist/leaflet.css";

const LEVEL_HEX = ["#50f0e6", "#50ccaa", "#f0e641", "#ff5050", "#960032", "#7d2181"];

/** Mapa de Asturias con cada estación coloreada por su nivel. Leaflet se carga solo en el navegador. */
export default function StationMap({ stations }: { stations: StationStatusSnapshot[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;

      map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 16,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const points = stations.filter((s) => s.lat !== null && s.lon !== null);
      for (const s of points) {
        const marker = L.circleMarker([s.lat!, s.lon!], {
          radius: 9,
          weight: 2,
          color: "#13272c",
          fillColor: LEVEL_HEX[s.level],
          fillOpacity: 1,
        }).addTo(map);
        const popup = document.createElement("div");
        const link = document.createElement("a");
        link.href = `/estacion/${slugify(s.name)}/`;
        link.textContent = s.name;
        link.style.fontWeight = "700";
        const detail = document.createElement("div");
        detail.textContent = `${LEVELS[s.level].label}. ${METRIC_SHORT[s.metric] ?? s.metric}: ${fmtNum(s.value)} ${s.unit}`;
        popup.append(link, detail);
        marker.bindPopup(popup);
        marker.bindTooltip(`${s.name}: ${LEVELS[s.level].label}`);
      }
      if (points.length) map.fitBounds(L.latLngBounds(points.map((s) => [s.lat!, s.lon!])), { padding: [24, 24] });
      else map.setView([43.36, -5.85], 9);
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [stations]);

  return (
    <figure className="mapa">
      <div ref={ref} className="mapa-lienzo" role="region" aria-label="Mapa de estaciones" />
      <figcaption className="nota">
        Cada punto es una estación, con el color de su nivel actual. Pulsa en uno para ver su nombre y su valor.
      </figcaption>
      <style>{`
        .mapa { margin: 0; display: grid; gap: 0.5rem; }
        .mapa-lienzo { height: min(62vh, 30rem); border-radius: var(--radio); border: 1px solid var(--linea); background: var(--superficie); }
        .mapa-lienzo .leaflet-tile-pane { filter: grayscale(0.85) contrast(0.9) brightness(1.04); }
        @media (prefers-color-scheme: dark) {
          .mapa-lienzo .leaflet-tile-pane { filter: grayscale(1) invert(0.92) hue-rotate(180deg) brightness(0.9) contrast(0.85); }
        }
        .mapa-lienzo .leaflet-popup-content { font-family: var(--fuente); font-size: var(--t-1); }
      `}</style>
    </figure>
  );
}
