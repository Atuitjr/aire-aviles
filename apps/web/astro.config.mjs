import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  integrations: [react()],
  // El .env vive en la raíz del monorepo
  vite: { envDir: "../.." },
});
