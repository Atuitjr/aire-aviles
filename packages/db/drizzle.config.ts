import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

// drizzle-kit se ejecuta desde packages/db (npm run db:push)
const root = path.resolve(process.cwd(), "../..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

let url = process.env.DATABASE_URL ?? "file:./data/aviles.db";
if (url.startsWith("file:")) {
  const rel = url.slice("file:".length);
  const abs = path.isAbsolute(rel) ? rel : path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  url = `file:${abs}`;
}

const common = { schema: "./src/schema.ts", out: "./drizzle" };

export default url.startsWith("file:")
  ? defineConfig({ ...common, dialect: "sqlite", dbCredentials: { url } })
  : defineConfig({
      ...common,
      dialect: "turso",
      dbCredentials: { url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined },
    });
