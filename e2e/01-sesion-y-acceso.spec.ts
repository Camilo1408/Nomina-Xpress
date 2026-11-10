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
  test("[NEG] el código inyectado en la página no se ejecuta (H10)", async ({ page }) => {
    const bloqueos: string[] = [];
    page.on("console", (msg) => {
      if (/Content Security Policy/i.test(msg.text())) bloqueos.push(msg.text());
    });
    await page.goto("/login");

    // El XSS clásico: HTML inyectado con un manejador en línea. Sin 'unsafe-inline' no corre.
    await page.evaluate(() => {
      const div = document.createElement("div");
      div.innerHTML = '<img src="data:image/png;base64,AA" onerror="window.__inyectado = true">';
      document.body.appendChild(div);
    });
    await expect.poll(() => bloqueos.join(" | ")).toMatch(/script-src/);
    expect(await page.evaluate(() => (window as unknown as { __inyectado?: boolean }).__inyectado)).toBeUndefined();

    // Y sin 'unsafe-eval', un texto no se ejecuta como código. Se prueba con setTimeout
    // porque el depurador exime de la CSP al eval que llama la propia prueba.
    await page.evaluate(() => {
      (window.setTimeout as (code: string, ms: number) => number)("window.__evaluado = true", 0);
    });
    await expect.poll(() => bloqueos.filter((b) => /unsafe-eval/.test(b)).length).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { __evaluado?: boolean }).__evaluado)).toBeUndefined();
  });

  test("la API responde con la política base, sin scripts en línea", async ({ request }) => {
    const res = await request.post("/api/inventory-permissions/session", { maxRedirects: 0 });
    const script = res.headers()["content-security-policy"].split("; ").find((d) => d.startsWith("script-src "));
    expect(script).toBe("script-src 'self'");
  });

  test("ninguna respuesta lleva dos políticas: la página solo la del nonce, los archivos solo la base", async ({ request }) => {
    const politicas = async (path: string) =>
      (await request.get(path, { maxRedirects: 0 }))
        .headersArray()
        .filter((h) => h.name.toLowerCase() === "content-security-policy")
        .flatMap((h) => h.value.split(/,\s*(?=default-src)/));

    const pagina = await politicas("/login");
    expect(pagina).toHaveLength(1);
    expect(pagina[0]).toContain("'nonce-");

    for (const path of ["/sw.js", "/manifest.json"]) {
      const archivo = await politicas(path);
      expect(archivo, path).toHaveLength(1);
      expect(archivo[0], path).toContain("script-src 'self';");
    }
  });

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

    // H10: los scripts solo corren con el nonce de la petición; nada de 'unsafe-inline' ni eval.
    const script = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(script).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'$/);
    const nonce = /'nonce-([^']+)'/.exec(script)![1];
    // Todos los scripts de la página llevan ese nonce.
    const nonces = await page.locator("script").evaluateAll((els) => els.map((el) => (el as HTMLScriptElement).nonce));
    expect(nonces.length).toBeGreaterThan(0);
    expect(new Set(nonces)).toEqual(new Set([nonce]));
    // Y el nonce cambia en cada petición.
    const otra = await page.request.get("/login");
    expect(otra.headers()["content-security-policy"]).not.toContain(nonce);

    await page.waitForLoadState("networkidle");
    expect(externos, "peticiones a otros dominios (p. ej. Google Fonts)").toEqual([]);

    // Las fuentes se sirven desde el propio dominio (next/font).
    const familia = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(familia).toMatch(/Inter/i);
  });
});
