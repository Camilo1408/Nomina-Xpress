/**
 * Captura las imágenes que ilustran MANUAL_DE_USUARIO.md.
 *
 * Requisitos:
 *   1. BD local sembrada:  npx tsx prisma/seed-local.ts
 *   2. Servidor corriendo: npm run dev
 *
 * Uso:
 *   node scripts/capture-docs-screenshots.mjs
 *   BASE_URL=http://localhost:3000 OUT_DIR=docs/img PERIOD_FROM=2026-07-01 \
 *     PERIOD_TO=2026-07-15 node scripts/capture-docs-screenshots.mjs
 *
 * Las imágenes van a `docs/img/`. Regenéralas cuando la UI cambie: el manual las
 * referencia por nombre, así que basta con volver a ejecutar este script.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = process.env.OUT_DIR ?? "docs/img";
/** Quincena con datos en el seed de demostración. */
const PERIOD_FROM = process.env.PERIOD_FROM ?? "2026-07-01";
const PERIOD_TO = process.env.PERIOD_TO ?? "2026-07-15";
const VIEWPORT = { width: 1440, height: 900 };

const ADMIN = { user: "proprietario", pass: "proprietario123" };
const EMPLOYEE = { user: "empleado", pass: "empleado123" };

let failures = 0;

async function login(page, { user, pass }) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/usuario/i).fill(user);
  await page.getByLabel(/contrase/i).fill(pass);
  await page.getByRole("button", { name: /^ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
}

async function goto(page, url) {
  await page.goto(`${BASE_URL}${url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

/** Oculta el indicador flotante de desarrollo de Next.js para que no salga en la captura. */
async function hideDevOverlay(page) {
  await page
    .addStyleTag({ content: "nextjs-portal, #__next-build-watcher { display: none !important; }" })
    .catch(() => {});
}

async function shot(page, name, opts = {}) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await hideDevOverlay(page);
  await page.waitForTimeout(500);
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
  console.log(`✓ ${file}`);
}

/** Ejecuta un paso aislado: si falla, lo reporta y sigue con el resto. */
async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    failures++;
    console.error(`✗ ${name}: ${err.message.split("\n")[0]}`);
  }
}

/** Rellena los dos <input type="date"> de una barra de filtros y aplica. */
async function setPeriod(page, from = PERIOD_FROM, to = PERIOD_TO, buttonName) {
  const dates = page.locator('input[type="date"]');
  await dates.nth(0).fill(from);
  await dates.nth(1).fill(to);
  if (buttonName) {
    await page.getByRole("button", { name: buttonName }).first().click();
    await page.waitForTimeout(1200);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    locale: "es-CO",
    timezoneId: "America/Bogota",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);

  // ── 1. Login ────────────────────────────────────────────────────────────
  await step("login", async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await shot(page, "01-login");
  });

  // ── Área de administración (PROPRIETARY ve el menú completo) ────────────
  await login(page, ADMIN);

  await step("dashboard", async () => {
    await goto(page, "/admin/dashboard");
    await shot(page, "02-dashboard");
  });

  await step("personal", async () => {
    await goto(page, "/admin/employees");
    await shot(page, "03-personal-lista");
  });

  await step("personal-form", async () => {
    await goto(page, "/admin/employees/new");
    await shot(page, "04-personal-form", { fullPage: true });
  });

  await step("bonos", async () => {
    await goto(page, "/admin/employees");
    await page.getByRole("button", { name: /gestionar bonos/i }).first().click();
    await page.waitForTimeout(900);
    await shot(page, "05-bonos-modal");
  });

  await step("horas-lista", async () => {
    await goto(page, "/admin/time-entries");
    await setPeriod(page, PERIOD_FROM, PERIOD_TO, /^filtrar$/i);
    await shot(page, "06-horas-lista");
  });

  await step("horas-form", async () => {
    await goto(page, "/admin/time-entries/new");
    await shot(page, "07-horas-form", { fullPage: true });
  });

  // Aviso de jornada > 8 h: se dispara al guardar un turno largo.
  await step("horas-confirmacion", async () => {
    await goto(page, "/admin/time-entries/new");
    // El selector de personal ya viene con el primer empleado preseleccionado.
    await page.locator('input[type="date"]').first().fill("2026-07-29");
    const times = page.locator('input[type="time"]');
    await times.nth(0).fill("10:00");
    await times.nth(1).fill("23:30");
    await page.getByRole("button", { name: /guardar|registrar/i }).first().click();
    await page.waitForTimeout(1200);
    await shot(page, "07b-horas-confirmacion");
  });

  await step("horarios", async () => {
    await goto(page, "/admin/schedules");
    await shot(page, "08-horarios-lista");
    await page.getByRole("link", { name: /horario 20/i }).first().click();
    await page.waitForLoadState("networkidle");
    await shot(page, "09-horario-detalle", { fullPage: true });
  });

  await step("propinas", async () => {
    await goto(page, "/admin/tips");
    await setPeriod(page, PERIOD_FROM, PERIOD_TO, /^filtrar$/i);
    // Despliega el día para que se vea el reparto por empleado.
    await page.getByText(/01\/07\/2026|2026-07-01/).first().click();
    await page.waitForTimeout(700);
    await shot(page, "10-propinas", { fullPage: true });
  });

  await step("propinas-form", async () => {
    await page.getByRole("button", { name: /registrar propinas/i }).first().click();
    await page.waitForTimeout(900);
    await shot(page, "11-propinas-form");
    await page.keyboard.press("Escape");
  });

  await step("reporte-nomina", async () => {
    await goto(page, "/admin/reports/payroll");
    await setPeriod(page, PERIOD_FROM, PERIOD_TO, /calcular n/i);
    await shot(page, "12-reporte-nomina", { fullPage: true });
  });

  await step("ajuste-pago", async () => {
    await page.getByRole("button", { name: /ajuste/i }).first().click();
    await page.waitForTimeout(900);
    await shot(page, "13-ajuste-pago");
    await page.keyboard.press("Escape");
  });

  await step("reporte-turnos", async () => {
    await goto(page, "/admin/reports/shifts");
    await setPeriod(page, PERIOD_FROM, PERIOD_TO, /calcular t/i);
    await shot(page, "14-reporte-turnos", { fullPage: true });
  });

  await step("usuarios", async () => {
    await goto(page, "/admin/usuarios");
    await shot(page, "15-usuarios");
  });

  await step("roles", async () => {
    await goto(page, "/admin/roles");
    await shot(page, "16-roles-lista");
    await goto(page, "/admin/roles/new");
    await shot(page, "17-roles-matriz", { fullPage: true });
  });

  await step("auditoria", async () => {
    await goto(page, "/admin/audit");
    await shot(page, "18-auditoria");
  });

  await step("festivos", async () => {
    await goto(page, "/admin/holidays");
    await shot(page, "19-festivos", { fullPage: true });
    await page.getByRole("button", { name: /nuevo festivo/i }).first().click();
    await page.waitForTimeout(900);
    await shot(page, "20-festivo-form");
    await page.keyboard.press("Escape");
  });

  await step("configuracion", async () => {
    await goto(page, "/admin/settings");
    await shot(page, "21-configuracion", { fullPage: true });
  });

  await step("perfil", async () => {
    await goto(page, "/admin/profile");
    await shot(page, "22-perfil");
  });

  // ── Portal del empleado ─────────────────────────────────────────────────
  await context.clearCookies();
  await login(page, EMPLOYEE);

  await step("portal-quincena", async () => {
    await goto(page, "/portal/report");
    await setPeriod(page, PERIOD_FROM, PERIOD_TO);
    await page.waitForTimeout(1500);
    await shot(page, "23-portal-mi-quincena", { fullPage: true });
  });

  await step("portal-horario", async () => {
    await goto(page, "/portal/schedule");
    await shot(page, "24-portal-mi-horario", { fullPage: true });
  });

  await step("portal-perfil", async () => {
    await goto(page, "/portal/profile");
    await shot(page, "25-portal-perfil", { fullPage: true });
  });

  await browser.close();
  if (failures > 0) {
    console.error(`\n${failures} paso(s) fallaron.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
