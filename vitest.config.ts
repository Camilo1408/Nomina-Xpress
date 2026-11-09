import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // `.claude/` guarda copias de trabajo de agentes (worktrees): no son pruebas del
    // proyecto. Sin esta exclusión, en local se contaban 7 archivos ajenos (456 casos en
    // vez de los 386 reales) y el número no coincidía con el del CI.
    // `e2e/` son pruebas de navegador de Playwright (`npm run test:e2e`), no de Vitest.
    exclude: [...configDefaults.exclude, ".claude/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
