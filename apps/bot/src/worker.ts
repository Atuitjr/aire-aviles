/**
 * Worker de Cloudflare:
 *   - Bot de Telegram por webhook:  POST /telegram
 *     (con la cabecera X-Telegram-Bot-Api-Secret-Token = WEBHOOK_SECRET, así nadie más puede llamarlo)
 *   - API pública para la web:      GET  /api/...  (ver src/api.ts)
 *
 * Secretos (wrangler secret put ...): TELEGRAM_BOT_TOKEN, DATABASE_URL, DATABASE_AUTH_TOKEN, WEBHOOK_SECRET
 */
import { webhookCallback } from "grammy";
import { createWebDb, type DB } from "@aviles/db/web";
import { handleApi } from "./api.ts";
import { createBot } from "./bot.ts";
import { createData } from "./data.ts";

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  DATABASE_URL: string;
  DATABASE_AUTH_TOKEN: string;
  WEBHOOK_SECRET: string;
}

type Handler = (req: Request) => Promise<Response>;

// Se reutilizan mientras Cloudflare mantenga viva la instancia del Worker
let db: DB | null = null;
let botHandler: Handler | null = null;

function getDb(env: Env): DB {
  return (db ??= createWebDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN));
}

function getBotHandler(env: Env): Handler {
  if (!botHandler) {
    const bot = createBot(env.TELEGRAM_BOT_TOKEN, createData(getDb(env)));
    botHandler = webhookCallback(bot, "cloudflare-mod", { secretToken: env.WEBHOOK_SECRET });
  }
  return botHandler;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(req, getDb(env));
      } catch (err) {
        console.error("[api]", err);
        return new Response('{"error":"internal"}', {
          status: 500,
          headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    if (req.method === "POST" && url.pathname === "/telegram") {
      // Rechazar antes de inicializar el bot: grammY llama a Telegram (getMe) antes de comprobar el secreto
      if (!env.WEBHOOK_SECRET || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      return getBotHandler(env)(req);
    }

    if (url.pathname === "/") {
      return new Response("Aire Avilés · bot de Telegram (@AireAvilesBot) y API de datos", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
};
