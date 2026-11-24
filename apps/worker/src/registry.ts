import { Registry } from "@aviles/core";
import { loadEnv } from "@aviles/core/env";
import { eeaAirSource } from "@aviles/source-eea-air";
import { consoleNotifier } from "./notifiers/console.ts";
import { telegramNotifier } from "./notifiers/telegram.ts";

loadEnv();

/**
 * Aquí se enchufa todo. Para añadir una fuente nueva (AEMET, oleaje...):
 *   1. crea packages/sources/<nombre> implementando SourcePlugin (con `index` si debe generar avisos)
 *   2. regístrala con addSource()
 *
 * Fuentes de calidad del aire:
 *   - eea-air:    tiempo casi real (horas de retraso) → avisos.
 *   - aviles-air: el ayuntamiento publica el año completo en enero → solo histórico.
 *                 No se registra aquí; se cargará con un script de backfill aparte.
 */
export const registry = new Registry().addSource(eeaAirSource).addNotifier(consoleNotifier);

const token = process.env.TELEGRAM_BOT_TOKEN;
if (token) registry.addNotifier(telegramNotifier(token));
else console.warn("[worker] Sin TELEGRAM_BOT_TOKEN: los avisos solo se muestran en consola");
