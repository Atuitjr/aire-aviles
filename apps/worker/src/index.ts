import cron from "node-cron";
import { loadEnv } from "@aviles/core/env";
import { registry } from "./registry.ts";
import { runIngest } from "./ingest.ts";

loadEnv();

const once = process.argv.includes("--once");
const schedule = process.env.INGEST_CRON ?? "5 * * * *";

async function tick(): Promise<boolean> {
  try {
    await runIngest(registry);
    return true;
  } catch (err) {
    console.error("[worker] Error en la ingesta:", err);
    return false;
  }
}

if (once) {
  // Una sola pasada (GitHub Actions): si falla, código de salida 1 para que el job salga en rojo
  const ok = await tick();
  process.exit(ok ? 0 : 1);
} else {
  console.log(`[worker] Fuentes: ${[...registry.sources.keys()].join(", ")} · cron "${schedule}"`);
  await tick(); // primera pasada al arrancar
  cron.schedule(schedule, tick, { timezone: "Europe/Madrid" });
}
