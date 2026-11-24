import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Raíz del monorepo (packages/core/src → ../../..) */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let loaded = false;

/** Carga el .env de la raíz una sola vez (si existe). Node >= 20.12. */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = path.join(ROOT_DIR, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
}
