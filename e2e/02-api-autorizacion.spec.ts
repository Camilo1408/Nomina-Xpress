// La API rechaza por su cuenta: no depende de que la interfaz oculte un botón (CP-49, CP-50).

import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("API sin sesión", () => {
  test("las rutas de administración no entregan datos: redirigen al inicio de sesión", async ({ request }) => {
    for (const path of ["/api/admin/employees", "/api/admin/users", "/api/admin/time-entries"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers()["location"]).toContain("/login");
    }
  });

  test("la verificación de sesión para Inventory responde 401 sin token (I-H1b)", async ({ request }) => {
    const res = await request.post("/api/inventory-permissions/session", { maxRedirects: 0 });
    expect(res.status()).toBe(401);
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

test.describe("API con sesión de empleado", () => {
  test("[CP-50] sin permiso responde 403, no 401", async ({ page }) => {
    await login(page, "empleado");
    for (const path of ["/api/admin/employees", "/api/admin/users"]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(403);
    }
    const crear = await page.request.post("/api/admin/employees", { data: { name: "Intruso" } });
    expect(crear.status()).toBe(403);
  });

  test("[CP-50] un ADMIN sin el permiso de ver empleados también recibe 403", async ({ page }) => {
    await login(page, "admin");
    expect((await page.request.get("/api/admin/employees")).status()).toBe(403);
    expect((await page.request.get("/api/admin/users")).status()).toBe(403);
  });
});

test.describe("API con sesión del propietario", () => {
  test("[CP-49] un cuerpo que no es JSON responde 400, no 500", async ({ page }) => {
    await login(page, "proprietario");
    const res = await page.request.post("/api/admin/employees", {
      headers: { "content-type": "application/json" },
      data: "{esto no es json",
    });
    expect(res.status()).toBe(400);
  });

  test("[NEG] un cuerpo que no cumple el esquema responde 400 y no crea nada", async ({ page }) => {
    await login(page, "proprietario");
    const antes: unknown[] = await (await page.request.get("/api/admin/employees")).json();
    const res = await page.request.post("/api/admin/employees", { data: { name: "" } });
    expect(res.status()).toBe(400);
    const despues: unknown[] = await (await page.request.get("/api/admin/employees")).json();
    expect(despues.length).toBe(antes.length);
  });
});

test.describe("Logo del restaurante (H9, CP-51)", () => {
  // PNG de 1 × 1 píxel.
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

  const subir = (page: import("@playwright/test").Page, name: string, mimeType: string, buffer: Buffer) =>
    page.request.post("/api/admin/tenant/logo", { multipart: { file: { name, mimeType, buffer } } });

  test("[NEG] un SVG, o un SVG renombrado a .png, se rechaza con 400", async ({ page }) => {
    await login(page, "proprietario");
    for (const [name, mime] of [["logo.svg", "image/svg+xml"], ["logo.png", "image/png"]] as const) {
      const res = await subir(page, name, mime, SVG);
      expect(res.status(), name).toBe(400);
      expect((await res.json()).error).toBe("El logo debe ser una imagen PNG, JPG o WEBP");
    }
  });

  test("un PNG real se acepta aunque el nombre diga otra cosa; el archivo queda como .png", async ({ page }) => {
    await login(page, "proprietario");
    try {
      const res = await subir(page, "logo.svg", "image/svg+xml", PNG);
      expect(res.status()).toBe(200);
      expect((await res.json()).logoUrl).toMatch(/^\/uploads\/[^/]+\.png\?v=\d+$/);
    } finally {
      // Deja la semilla como estaba: sin logo.
      expect((await page.request.delete("/api/admin/tenant/logo")).status()).toBe(200);
    }
  });

  test("[CP-50] un empleado no puede subir un logo", async ({ page }) => {
    await login(page, "empleado");
    expect((await subir(page, "logo.png", "image/png", PNG)).status()).toBe(403);
  });
});
