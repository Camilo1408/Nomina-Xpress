import { defineConfig, devices } from "@playwright/test";

// Pruebas E2E de navegador (CP-40, compuerta G10). Corren contra el build de producción
// servido en local con una SQLite efímera y los usuarios de la semilla de prueba
// (ver e2e/start-server.mjs). Uso: `npm run build && npm run test:e2e`.

const PORT = process.env.E2E_PORT ?? "3100";
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Todas las pruebas comparten una base y algunas bloquean o desactivan usuarios:
  // un solo worker y en orden, para que no se pisen.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node e2e/start-server.mjs",
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
