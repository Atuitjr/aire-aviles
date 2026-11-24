/**
 * Envío directo por la Bot API (sin dependencias): lo usa el worker para las alertas.
 * El bot interactivo (apps/bot) usa grammY.
 */
export class TelegramError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** true si el usuario bloqueó el bot o el chat ya no existe → conviene borrar la suscripción */
    readonly chatGone: boolean,
  ) {
    super(message);
  }
}

export async function sendMessage(token: string, chatId: string, html: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (res.ok) return;

  const body = (await res.json().catch(() => ({}))) as { description?: string };
  const desc = body.description ?? res.statusText;
  const chatGone = res.status === 403 || /chat not found|bot was blocked|user is deactivated/i.test(desc);
  throw new TelegramError(`Telegram ${res.status}: ${desc}`, res.status, chatGone);
}
