/**
 * Apunta el bot de Telegram al Worker de Cloudflare y registra el menú de comandos.
 *
 *   npm run set-webhook -w @aviles/bot -- https://aire-aviles-bot.<tu-subdominio>.workers.dev
 *
 * Usa TELEGRAM_BOT_TOKEN y WEBHOOK_SECRET del .env (el mismo secreto que guardaste en Cloudflare).
 */
import { Api } from "grammy";
import { loadEnv } from "@aviles/core/env";
import { COMMANDS } from "./bot.ts";

loadEnv();

const base = process.argv[2]?.replace(/\/+$/, "");
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.WEBHOOK_SECRET;

if (!base?.startsWith("https://")) {
  console.error("Uso: npm run set-webhook -w @aviles/bot -- https://<tu-worker>.workers.dev");
  process.exit(1);
}
if (/TUSUBDOMINIO|<|>/i.test(base)) {
  console.error(
    "La URL todavía tiene el texto de ejemplo. Usa la URL real que te dio `npm run deploy -w @aviles/bot`\n" +
      "(o la de Cloudflare → Workers & Pages → aire-aviles-bot).",
  );
  process.exit(1);
}

// Antes de tocar Telegram, comprobar que el Worker responde en esa URL
try {
  const res = await fetch(base);
  if (!res.ok) throw new Error(`respuesta ${res.status}`);
} catch (err) {
  console.error(`No se puede abrir ${base} (${(err as Error).message}). ¿Está bien la URL y desplegado el Worker?`);
  process.exit(1);
}
if (!token || !secret) {
  console.error("Faltan TELEGRAM_BOT_TOKEN o WEBHOOK_SECRET en el .env");
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
  console.error("WEBHOOK_SECRET debe tener entre 16 y 256 caracteres: letras, números, _ y -");
  process.exit(1);
}

const api = new Api(token);
const url = `${base}/telegram`;

try {
  await api.setWebhook(url, {
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  });
  await api.setMyCommands(COMMANDS);
} catch (err) {
  // Mostrar solo el motivo: el error completo de grammY incluye el secreto en el payload
  const e = err as { description?: string; message?: string };
  console.error(`Telegram ha rechazado la configuración: ${e.description ?? e.message}`);
  process.exit(1);
}

const info = await api.getWebhookInfo();
console.log(`Webhook configurado: ${info.url}`);
console.log(`Mensajes pendientes: ${info.pending_update_count}`);
if (info.last_error_message) console.log(`Último error de Telegram: ${info.last_error_message}`);
