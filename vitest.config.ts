import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // Base SQLite plantilla para las pruebas de integración (*.db.test.ts).
    globalSetup: ["./vitest.global-setup.ts"],
    // `.claude/` guarda copias de trabajo de agentes (worktrees): no son pruebas del
    // proyecto. Sin esta exclusión, en local se contaban 7 archivos ajenos (456 casos en
    // vez de los 386 reales) y el número no coincidía con el del CI.
    // `e2e/` y `e2e-integracion/` son pruebas de navegador de Playwright, no de Vitest.
    exclude: [...configDefaults.exclude, ".claude/**", "e2e/**", "e2e-integracion/**"],
    // M-01 / G4: cobertura de la lógica de negocio (src/lib y rutas de la API).
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/app/api/**"],
      exclude: ["**/__tests__/**", "src/test/**"],
      reporter: ["text-summary", "json-summary"],
      // Umbral de no retroceso, fijado en lo medido el 09/11/2026: 40,4 % en total,
      // 64,5 % en src/lib y 21,9 % en las rutas. La meta del Plan de Calidad es 60 % en
      // total; estos números se suben cada vez que la cobertura suba, nunca se bajan.
      thresholds: {
        lines: 40,
        "src/lib/**": { lines: 64 },
        "src/app/api/**": { lines: 21 },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only.ts"),
    },
  },
});
