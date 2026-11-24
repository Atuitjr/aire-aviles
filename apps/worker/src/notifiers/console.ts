import type { Notifier } from "@aviles/core";

const KIND: Record<string, string> = { start: "INICIO", worse: "EMPEORA", end: "FIN" };

/** Notificador de desarrollo: imprime los avisos. */
export const consoleNotifier: Notifier = {
  id: "console",
  async send(alert, recipients, station) {
    const to = recipients.length ? ` → ${recipients.join(", ")}` : "";
    console.log(
      `${alert.levelInfo.icon} [${KIND[alert.kind]}] ${station.name}: ${alert.levelInfo.label} ` +
        `(${alert.metric} ${alert.value} ${alert.unit})${to}`,
    );
  },
};
