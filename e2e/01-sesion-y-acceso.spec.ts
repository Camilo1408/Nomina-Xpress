// Inicio de sesión y acceso por portal, en un navegador real contra el build de producción.

import { expect, test } from "@playwright/test";
import { LOGIN_ERROR, login, submitLogin, watchPage } from "./helpers";

test.describe("Inicio de sesión", () => {
  test("sin sesión, cualquier página lleva al inicio de sesión", async ({ page }) => {
    for (const path of ["/admin/dashboard", "/admin/usuarios", "/portal/report", "/"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("[NEG] una contraseña incorrecta muestra el error y no abre sesión", async ({ page }) => {
    await submitLogin(page, "admin", "no-es-la-clave");
    await expect(page.getByText(LOGIN_ERROR)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("[CP-46] un usuario inexistente recibe el mismo mensaje que una contraseña incorrecta", async ({ page }) => {
    await submitLogin(page, "usuario.que.no.existe", "cualquier-clave");
    await expect(page.getByText(LOGIN_ERROR)).toBeVisible();
  });

  test("un administrador entra al panel, sin errores ni recursos bloqueados por la CSP", async ({ page }) => {
    const watch = watchPage(page);
    await login(page, "admin");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByRole("navigation").first()).toBeVisible();
    watch.expectClean();
  });

  test("con sesión abierta, /login redirige al panel", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/login");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });
});

test.describe("Acceso por portal", () => {
  test("un empleado entra a su portal y no puede abrir el área de administración", async ({ page }) => {
    const watch = watchPage(page);
    await login(page, "empleado");
    await expect(page).toHaveURL(/\/portal\/report$/);

    for (const path of ["/admin/dashboard", "/admin/usuarios", "/admin/reports"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/portal\/report$/);
    }
    watch.expectClean();
  });

  test("un administrador no entra al portal del empleado", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/portal/report");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });
});

test.describe("Cabeceras de seguridad", () => {
  test("la página de inicio de sesión envía la CSP aplicada y no carga nada de terceros", async ({ page }) => {
    const externos: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.protocol.startsWith("http") && url.hostname !== "localhost") externos.push(req.url());
    });

    const res = await page.goto("/login");
    const csp = res!.headers()["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res!.headers()["content-security-policy-report-only"]).toBeUndefined();

    await page.waitForLoadState("networkidle");
    expect(externos, "peticiones a otros dominios (p. ej. Google Fonts)").toEqual([]);

    // Las fuentes se sirven desde el propio dominio (next/font).
    const familia = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(familia).toMatch(/Inter/i);
  });
});
