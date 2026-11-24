/**
 * Definición del bot: comandos, botones y textos. No arranca nada por sí mismo:
 *   - src/index.ts  → en local, con long polling
 *   - src/worker.ts → en Cloudflare Workers, por webhook
 */
import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";
import {
  esc,
  formatStationDetail,
  formatStatus,
  HELP_SECTIONS,
  helpText,
  ZONE_ORDER,
  type HelpSection,
} from "@aviles/telegram";
import type { BotData, StationItem } from "./data.ts";

/** Menú de comandos que muestra Telegram al escribir "/" */
export const COMMANDS = [
  { command: "ahora", description: "Cómo está el aire ahora" },
  { command: "suscribir", description: "Elegir zonas o estaciones para recibir avisos" },
  { command: "mis", description: "Ver tus avisos activos" },
  { command: "baja", description: "Dejar de recibir avisos" },
  { command: "ayuda", description: "Qué significa cada nivel y contaminante" },
];

const html = { parse_mode: "HTML" as const };
const DEFAULT_ZONE = "ES0307"; // Avilés
const ZONE_QUESTION = "¿De qué zona quieres recibir avisos?";

/** Zonas con estaciones activas, en el orden de ZONE_ORDER */
function zonesOf(list: StationItem[]): { zone: string; zoneName: string }[] {
  const seen = new Map<string, string>();
  for (const s of list) seen.set(s.zone, s.zoneName);
  return [...seen]
    .map(([zone, zoneName]) => ({ zone, zoneName }))
    .sort((a, b) => (ZONE_ORDER.indexOf(a.zone) + 1 || 99) - (ZONE_ORDER.indexOf(b.zone) + 1 || 99));
}

/** Botones de /ayuda: todas las secciones menos la actual */
function helpKeyboard(current: HelpSection): InlineKeyboard {
  const kb = new InlineKeyboard();
  (Object.keys(HELP_SECTIONS) as HelpSection[])
    .filter((s) => s !== current)
    .forEach((s, i) => {
      kb.text(HELP_SECTIONS[s], `help:${s}`);
      if (i % 2 === 1) kb.row();
    });
  return kb;
}

export function createBot(token: string, data: BotData): Bot {
  const bot = new Bot(token);

  /** Paso 1 de /suscribir: elegir zona */
  async function zonesKeyboard(): Promise<InlineKeyboard | null> {
    const list = await data.listStations();
    if (!list.length) return null;
    const kb = new InlineKeyboard().text("📍 Todas las estaciones de Asturias", "sub:all").row();
    zonesOf(list).forEach((z, i) => {
      kb.text(z.zoneName, `zone:${z.zone}`);
      if (i % 2 === 1) kb.row();
    });
    return kb;
  }

  /** Paso 2 de /suscribir: estaciones de la zona */
  async function zoneStationsKeyboard(zone: string): Promise<{ kb: InlineKeyboard; zoneName: string } | null> {
    const list = (await data.listStations()).filter((s) => s.zone === zone);
    if (!list.length) return null;
    const zoneName = list[0].zoneName;
    const kb = new InlineKeyboard().text(`📍 Toda la zona de ${zoneName}`, `subz:${zone}`).row();
    list.forEach((s, i) => {
      kb.text(s.name, `sub:${s.id}`);
      if (i % 2 === 1) kb.row();
    });
    kb.row().text("« Volver", "zones");
    return { kb, zoneName };
  }

  /**
   * Botones de /ahora: las estaciones de la zona actual (para ver el detalle)
   * y debajo las demás zonas. En la vista "Todas" solo se muestran las zonas.
   */
  async function statusKeyboard(current: string): Promise<InlineKeyboard> {
    const list = await data.listStations();
    const kb = new InlineKeyboard();
    if (current !== "all") {
      list
        .filter((s) => s.zone === current)
        .forEach((s, i) => {
          kb.text(`🔎 ${s.name}`, `st:${s.id}|${current}`);
          if (i % 2 === 1) kb.row();
        });
      kb.row();
    }
    zonesOf(list)
      .filter((z) => z.zone !== current)
      .forEach((z, i) => {
        kb.text(z.zoneName, `now:${z.zone}`);
        if (i % 3 === 2) kb.row();
      });
    if (current !== "all") kb.row().text("Todas", "now:all");
    return kb;
  }

  async function subscriptionsText(chatId: string): Promise<string> {
    const subs = await data.getSubscriptions(chatId);
    if (!subs.length) return "No tienes avisos activos. Usa /suscribir para activarlos.";
    if (subs.some((s) => s.stationId === null)) return "Recibes avisos de <b>todas las estaciones</b>.";
    return `Recibes avisos de: <b>${subs.map((s) => esc(s.stationName ?? s.stationId ?? "?")).join(", ")}</b>.`;
  }

  bot.command("start", async (ctx) => {
    await ctx.reply(
      [
        "👋 <b>Aire Avilés</b>",
        "",
        "Te aviso cuando la calidad del aire empeora en Avilés (y en el resto de Asturias, si quieres).",
        "",
        "/ahora · cómo está el aire ahora",
        "/suscribir · elegir zonas o estaciones",
        "/mis · ver tus avisos",
        "/baja · dejar de recibir avisos",
        "/ayuda · qué significa cada nivel y contaminante",
        "",
        "<i>Datos provisionales de la Red de Control de la Calidad del Aire del Principado de Asturias, " +
          "obtenidos a través de la Agencia Europea de Medio Ambiente. Llegan con unas horas de retraso.</i>",
      ].join("\n"),
      html,
    );
  });

  bot.command("suscribir", async (ctx) => {
    const kb = await zonesKeyboard();
    if (!kb) return ctx.reply("Todavía no hay estaciones cargadas. Prueba en un rato.");
    await ctx.reply(ZONE_QUESTION, { reply_markup: kb });
  });

  bot.callbackQuery("zones", async (ctx) => {
    const kb = await zonesKeyboard();
    await ctx.answerCallbackQuery();
    if (kb) await ctx.editMessageText(ZONE_QUESTION, { reply_markup: kb });
  });

  bot.callbackQuery(/^zone:(.+)$/, async (ctx) => {
    const res = await zoneStationsKeyboard(ctx.match[1]);
    await ctx.answerCallbackQuery();
    if (res) await ctx.editMessageText(`Estaciones de ${res.zoneName}:`, { reply_markup: res.kb });
  });

  bot.callbackQuery(/^subz:(.+)$/, async (ctx) => {
    const chatId = String(ctx.chat?.id ?? ctx.from.id);
    const added = await data.subscribeZone(chatId, ctx.match[1]);
    await ctx.answerCallbackQuery(added ? "✅ Suscrito" : "Ya estabas suscrito");
    await ctx.editMessageText(`${added ? "✅ Hecho. " : ""}${await subscriptionsText(chatId)}`, html);
  });

  bot.callbackQuery(/^sub:(.+)$/, async (ctx) => {
    const chatId = String(ctx.chat?.id ?? ctx.from.id);
    const target = ctx.match[1];
    const created = await data.subscribe(chatId, target === "all" ? null : target);
    await ctx.answerCallbackQuery(created ? "✅ Suscrito" : "Ya estabas suscrito");
    await ctx.editMessageText(`${created ? "✅ Hecho. " : ""}${await subscriptionsText(chatId)}`, html);
  });

  bot.command("ahora", async (ctx) => {
    await ctx.reply(formatStatus(await data.currentStatus(), DEFAULT_ZONE), {
      ...html,
      reply_markup: await statusKeyboard(DEFAULT_ZONE),
    });
  });

  bot.callbackQuery(/^now:(.+)$/, async (ctx) => {
    const zone = ctx.match[1];
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(formatStatus(await data.currentStatus(), zone === "all" ? undefined : zone), {
      ...html,
      reply_markup: await statusKeyboard(zone),
    });
  });

  // Detalle de una estación: "st:<stationId>|<zona desde la que se abrió>"
  bot.callbackQuery(/^st:(.+)\|(.+)$/, async (ctx) => {
    const [, stationId, fromZone] = ctx.match;
    await ctx.answerCallbackQuery();
    const detail = await data.stationDetail(stationId);
    if (!detail) return;
    const status = (await data.currentStatus()).find((s) => s.stationId === stationId);
    await ctx.editMessageText(formatStationDetail(status, detail.name, detail.rows, detail.zoneName), {
      ...html,
      reply_markup: new InlineKeyboard().text("« Volver", `now:${fromZone}`),
    });
  });

  bot.command(["ayuda", "help"], async (ctx) => {
    await ctx.reply(helpText("inicio"), { ...html, reply_markup: helpKeyboard("inicio") });
  });

  bot.callbackQuery(/^help:(\w+)$/, async (ctx) => {
    const section = (ctx.match[1] in HELP_SECTIONS ? ctx.match[1] : "inicio") as HelpSection;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(helpText(section), { ...html, reply_markup: helpKeyboard(section) });
  });

  bot.command("mis", async (ctx) => {
    await ctx.reply(await subscriptionsText(String(ctx.chat.id)), html);
  });

  bot.command("baja", async (ctx) => {
    const n = await data.unsubscribeAll(String(ctx.chat.id));
    await ctx.reply(n ? "Listo, ya no recibirás avisos. Puedes volver con /suscribir." : "No tenías avisos activos.");
  });

  // Pulsar un botón de un mensaje antiguo cuyo texto ya es igual: Telegram lo rechaza, no es un error real
  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError && e.description.includes("message is not modified")) return;
    if (e instanceof GrammyError) console.error("[bot] Error de Telegram:", e.description);
    else if (e instanceof HttpError) console.error("[bot] Error de red:", e);
    else console.error("[bot] Error:", e);
  });

  return bot;
}

/** Explica por qué Telegram rechaza un token (401) */
export function diagnoseToken(token: string): string {
  const t = token.trim();
  const problems = [
    t !== token && "tiene espacios al principio o al final",
    /^["']|["']$/.test(t) && "está entre comillas (quítalas)",
    /^bot/i.test(t) && 'empieza por "bot" (pon solo el token, sin el prefijo)',
    !/^\d+:[\w-]{30,}$/.test(t.replace(/^["']|["']$/g, "")) && "no tiene el formato 123456789:AAH... (¿copiado incompleto?)",
  ].filter(Boolean);
  return problems.length
    ? `Posibles problemas en TELEGRAM_BOT_TOKEN: ${problems.join("; ")}.`
    : "El formato parece correcto: puede que el token se haya revocado. Pide el actual a @BotFather (/mybots → API Token).";
}
