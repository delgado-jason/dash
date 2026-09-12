import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    // Pin the test clock's zone. The relationship libs split LOCAL (Brandie's
    // calendar — the day plan, the cap week, Today's "days since") from UTC
    // (DATE columns) on purpose; on a UTC machine every local-vs-UTC test
    // would pass as a tautology. Central is the business's zone.
    env: { TZ: "America/Chicago" },
  },
});
