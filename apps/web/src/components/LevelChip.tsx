import { LEVELS, inkOn } from "../lib/levels.ts";

/** Nivel del índice: color + nombre (nunca solo color) */
export default function LevelChip({ level }: { level: number | null }) {
  if (level === null) return <span className="chip nota">Fuera del índice</span>;
  return (
    <span className="chip" style={{ background: `var(--nivel-${level})`, color: inkOn(level) }}>
      {LEVELS[level].label}
    </span>
  );
}
