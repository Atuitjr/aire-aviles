import { useEffect, useState } from "react";

interface Station {
  id: string;
  name: string;
}

interface Measurement {
  metric: string;
  value: number;
  unit: string;
  observedAt: string;
}

export default function StationList({ apiUrl }: { apiUrl: string }) {
  const [stations, setStations] = useState<Station[]>([]);
  const [latest, setLatest] = useState<Record<string, Measurement[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/stations`);
        const list: Station[] = await res.json();
        setStations(list);

        const entries = await Promise.all(
          list.map(async (s) => {
            const r = await fetch(`${apiUrl}/stations/${encodeURIComponent(s.id)}/latest`);
            return [s.id, (await r.json()) as Measurement[]] as const;
          }),
        );
        setLatest(Object.fromEntries(entries));
      } catch {
        setError("No se pudo conectar con la API. ¿Está arrancada?");
      }
    })();
  }, [apiUrl]);

  if (error) return <p>{error}</p>;
  if (!stations.length) return <p>Cargando estaciones…</p>;

  return (
    <ul>
      {stations.map((s) => (
        <li key={s.id}>
          <strong>{s.name}</strong>
          {latest[s.id]?.length ? (
            <ul>
              {latest[s.id].map((m) => (
                <li key={m.metric}>
                  {m.metric}: {m.value} {m.unit}{" "}
                  <small>({new Date(m.observedAt).toLocaleString("es-ES")})</small>
                </li>
              ))}
            </ul>
          ) : (
            <span> · sin datos todavía</span>
          )}
        </li>
      ))}
    </ul>
  );
}
