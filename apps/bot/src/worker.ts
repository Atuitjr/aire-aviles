/**
 * Bot en Cloudflare Workers. Telegram envía cada mensaje por webhook a:
 *   POST https://<worker>.workers.dev/telegram
 * con la cabecera X-Telegram-Bot-Api-Secret-Token = WEBHOOK_SECRET (así nadie más puede llamarlo).
 *
 * Secretos (wrangler secret put ...): TELEGRAM_BOT_TOKEN, DATABASE_URL, DATABASE_AUTH_TOKEN, WEBHOOK_SECRET
 */
import { webhookCallback } from "grammy";
import { createWebDb } from "@aviles/db/web";
import { createBot } from "./bot.ts";
import { createData } from "./data.ts";

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  DATABASE_URL: string;
  DATABASE_AUTH_TOKEN: string;
  WEBHOOK_SECRET: string;
}

type Handler = (req: Request) => Promise<Response>;

// Se reutiliza mientras Cloudflare mantenga viva la instancia del Worker
let handler: Handler | null = null;

function getHandler(env: Env): Handler {
  if (!handler) {
    const db = createWebDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
    const bot = createBot(env.TELEGRAM_BOT_TOKEN, createData(db));
    handler = webhookCallback(bot, "cloudflare-mod", { secretToken: env.WEBHOOK_SECRET });
  }
  return handler;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/telegram") {
      // Rechazar antes de inicializar el bot: grammY llama a Telegram (getMe) antes de comprobar el secreto
      if (!env.WEBHOOK_SECRET || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      return getHandler(env)(req);
    }
    if (url.pathname === "/") {
      return new Response("Aire Avilés · bot de Telegram (@AireAvilesBot)", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
};
