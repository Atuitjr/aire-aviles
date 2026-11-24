/** Todo lo que cambiará con el nombre definitivo del proyecto está aquí */
export const SITE_NAME = "Aire Avilés";
export const SITE_DESCRIPTION =
  "Calidad del aire en Avilés y el resto de Asturias, hora a hora: estado actual de cada estación, histórico y avisos por Telegram.";
export const BOT_USERNAME = "AireAvilesBot";
export const BOT_URL = `https://t.me/${BOT_USERNAME}`;

/** API del Worker de Cloudflare (pública y de solo lectura). Se puede cambiar con PUBLIC_AIRE_API_URL. */
export const API_URL: string =
  import.meta.env.PUBLIC_AIRE_API_URL || "https://aire-aviles-bot.atuitjr-manga.workers.dev";

/** Zona que se muestra por defecto */
export const DEFAULT_ZONE = "ES0307"; // Avilés

/** Orden de las zonas en los listados: Avilés primero */
export const ZONE_ORDER = ["ES0307", "ES0309", "ES0306", "ES0308", "ES0311"];
