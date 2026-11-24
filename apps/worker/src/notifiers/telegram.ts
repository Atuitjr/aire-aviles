import type { Notifier } from "@aviles/core";
import { db, subscriptions } from "@aviles/db";
import { formatAlert, sendMessage, TelegramError } from "@aviles/telegram";
import { and, eq } from "drizzle-orm";

/** Envía cada alerta a los chats suscritos. Borra las suscripciones de chats que bloquearon el bot. */
export function telegramNotifier(token: string): Notifier {
  return {
    id: "telegram",
    async send(alert, recipients, station) {
      const html = formatAlert(alert, station.name);
      for (const chatId of new Set(recipients)) {
        try {
          await sendMessage(token, chatId, html);
        } catch (err) {
          if (err instanceof TelegramError && err.chatGone) {
            await db
              .delete(subscriptions)
              .where(and(eq(subscriptions.channel, "telegram"), eq(subscriptions.recipient, chatId)));
            console.warn(`[telegram] Chat ${chatId} ya no disponible: suscripciones eliminadas`);
          } else {
            console.error(`[telegram] Error enviando a ${chatId}:`, (err as Error).message);
          }
        }
        // Telegram limita a ~30 mensajes/s; con esto vamos muy por debajo
        await new Promise((r) => setTimeout(r, 50));
      }
    },
  };
}
