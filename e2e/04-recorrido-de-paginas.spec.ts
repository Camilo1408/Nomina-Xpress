// Recorrido de humo: cada pantalla del panel y del portal carga con los datos de la
// semilla, sin errores de JavaScript, sin respuestas 5xx y sin recursos bloqueados por la CSP.

import { expect, test } from "@playwright/test";
import { login, watchPage } from "./helpers";

const ADMIN_PAGES = [
  "/admin/dashboard",
  "/admin/employees",
  "/admin/time-entries",
  "/admin/schedules",
  "/admin/tips",
  "/admin/contests",
  "/admin/reports",
  "/admin/roles",
  "/admin/usuarios",
  "/admin/holidays",
  "/admin/audit",
  "/admin/settings",
  "/admin/profile",
];

test("el PROPRIETARY abre todas las pantallas del panel", async ({ page }) => {
  test.setTimeout(120_000);
  const watch = watchPage(page);
  await login(page, "proprietario");

  for (const path of ADMIN_PAGES) {
    const res = await page.goto(path);
    expect(res!.status(), path).toBe(200);
    // Algunas secciones redirigen a su primera pestaña (p. ej. /admin/reports → /payroll).
    expect(new URL(page.url()).pathname.startsWith(path), `${path} → ${page.url()}`).toBe(true);
    await expect(page.locator("main"), path).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  watch.expectClean();
});

test("el empleado abre las pantallas de su portal", async ({ page }) => {
  const watch = watchPage(page);
  await login(page, "empleado");

  for (const path of ["/portal/report", "/portal/schedule", "/portal/profile"]) {
    const res = await page.goto(path);
    expect(res!.status(), path).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
  }
  watch.expectClean();
});

test("el reporte de nómina muestra a los empleados de la semilla con su total a pagar", async ({ page }) => {
  await login(page, "proprietario");
  await page.goto("/admin/reports/payroll");
  await page.getByRole("button", { name: "Calcular nómina" }).click();

  // La semilla registra horas en la quincena actual: el reporte no puede salir vacío.
  await expect(page.locator("main")).toContainText(/\$\s?\d/, { timeout: 15_000 });
});
