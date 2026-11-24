/**
 * Bot en local con long polling (desarrollo). En producción se usa src/worker.ts.
 * Si el bot tiene un webhook configurado, long polling no funciona: este script lo quita
 * al arrancar, así que acuérdate de volver a ejecutar `npm run set-webhook` después.
 */
import { GrammyError } from "grammy";
import { loadEnv } from "@aviles/core/env";
import { db } from "@aviles/db";
import { COMMANDS, createBot, diagnoseToken } from "./bot.ts";
import { createData } from "./data.ts";

loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("[bot] Falta TELEGRAM_BOT_TOKEN en el .env");
  process.exit(1);
}

const bot = createBot(token, createData(db));

try {
  const me = await bot.api.getMe();
  console.log(`[bot] Token válido para @${me.username}`);
} catch (err) {
  if (err instanceof GrammyError && err.error_code === 401) {
    console.error(`[bot] Telegram rechaza el token (401 Unauthorized).\n      ${diagnoseToken(token)}`);
  } else {
    console.error("[bot] No se pudo conectar con Telegram:", (err as Error).message);
  }
  process.exit(1);
}

const webhook = await bot.api.getWebhookInfo();
if (webhook.url) {
  console.warn(`[bot] El bot tenía un webhook (${webhook.url}). Lo quito para usar long polling en local.`);
  console.warn("[bot] Cuando termines, vuelve a activarlo con: npm run set-webhook -w @aviles/bot -- <url del Worker>");
}

await bot.api.setMyCommands(COMMANDS);

const stop = () => bot.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

console.log("[bot] Arrancando (long polling)…");
await bot.start({ drop_pending_updates: false, onStart: (me) => console.log(`[bot] @${me.username} listo`) });
