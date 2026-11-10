import { defineConfig, devices } from "@playwright/test";
import { INTEGRATION_ENV, INVENTORY_URL, NOMINA_URL } from "./e2e-integracion/env.mjs";

// Pruebas de integración Nómina ↔ Inventory: las dos aplicaciones reales, en modo
// integrado, con el mismo NEXTAUTH_SECRET y la cookie de sesión compartida.
// Uso y preparación de los builds: e2e-integracion/README.md.

export default defineConfig({
  testDir: "./e2e-integracion",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: NOMINA_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/start-server.mjs",
      url: `${NOMINA_URL}/login`,
      env: INTEGRATION_ENV.nomina,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "node e2e-integracion/start-inventory.mjs",
      // /unauthorized responde 200 sin sesión: sirve para saber que Inventory ya arrancó.
      url: `${INVENTORY_URL}/unauthorized`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
