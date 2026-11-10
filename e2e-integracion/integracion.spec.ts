// Integración Nómina ↔ Inventory: las dos aplicaciones reales en modo integrado.
//
// Nómina emite la sesión; Inventory lee la misma cookie y le pregunta a Nómina si sigue
// vigente (I-H1b). Aquí se comprueba el recorrido completo que hasta ahora solo se
// probaba a mano: entrar, permisos por rol y revocación entre las dos aplicaciones.

import { expect, test, type Page } from "@playwright/test";
import { LOGIN_ERROR, USERS, login, sessionFor, submitLogin, userIdOf } from "../e2e/helpers";
import { INVENTORY_URL, NOMINA_URL } from "./env.mjs";

const inv = (path: string) => `${INVENTORY_URL}${path}`;

/** Estado HTTP de una ruta de la API de Inventory con la sesión de `page`. */
const invApi = async (page: Page, path: string) => (await page.request.get(inv(path))).status();

test.describe("Entrar al inventario", () => {
  test("sin sesión, el inventario lleva al inicio de sesión de Nómina y vuelve al inventario al entrar", async ({ page }) => {
    await page.goto(inv("/productos"));
    await expect(page).toHaveURL(new RegExp(`^${NOMINA_URL}/login\\?callbackUrl=`));
    expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe(inv("/productos"));

    const { username, password } = USERS.proprietario;
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();

    await page.waitForURL(inv("/productos"));
    await expect(page.getByRole("heading", { name: /productos/i }).first()).toBeVisible();
  });

  test("[NEG] el retorno solo se respeta hacia el inventario: otro destino se ignora", async ({ page }) => {
    await page.goto(`/login?callbackUrl=${encodeURIComponent("https://example.com/robo")}`);
    const { username, password } = USERS.proprietario;
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(`${NOMINA_URL}/admin/dashboard`);
  });

  test("con la sesión de Nómina, el inventario abre sin volver a pedir la clave", async ({ page }) => {
    await login(page, "proprietario");
    await page.goto(inv("/"));
    await expect(page).toHaveURL(inv("/"));
    expect(await invApi(page, "/api/products")).toBe(200);
    expect(await invApi(page, "/api/categories")).toBe(200);
  });

  test("sin sesión, la API del inventario responde 401", async ({ request }) => {
    for (const path of ["/api/products", "/api/movements", "/api/alerts"]) {
      expect((await request.get(inv(path))).status(), path).toBe(401);
    }
  });
});

test.describe("Permisos que llegan de Nómina (RN-I07)", () => {
  test("un empleado sin acceso al inventario no entra", async ({ page }) => {
    await login(page, "empleado");
    await page.goto(inv("/productos"));
    await expect(page).toHaveURL(inv("/unauthorized"));
    expect(await invApi(page, "/api/products")).toBe(403);
  });

  test("un ADMIN gestiona productos; lo que crea queda a su nombre", async ({ page }) => {
    await login(page, "admin");
    const { categories }: { categories: Array<{ id: string; name: string }> } = await (
      await page.request.get(inv("/api/categories"))
    ).json();
    const cocina = categories.find((c) => c.name === "Cocina");
    expect(cocina, "categoría Cocina de la semilla de Inventory").toBeTruthy();

    const crear = await page.request.post(inv("/api/products"), {
      data: { name: "Harina de integración", unit: "kg", categoryId: cocina!.id, minStock: 2 },
    });
    expect(crear.status()).toBe(201);
    const { product: producto }: { product: { id: string } } = await crear.json();

    const entrada = await page.request.post(inv("/api/movements"), {
      data: { productId: producto.id, type: "ENTRY", quantity: 5 },
    });
    expect(entrada.status()).toBe(201);
    const { movement, product } = await entrada.json();
    expect(product.currentStock).toBe(5);
    // El usuario del movimiento se copia de la sesión de Nómina (no hay tabla de usuarios aquí).
    expect(movement.userName).toBeTruthy();
    expect(movement.userId).toBe(await userIdOf(await proprietarioPage(page), "admin"));
  });
});

/** Página con sesión de PROPRIETARY en un contexto aparte (para consultar ids en Nómina). */
async function proprietarioPage(page: Page): Promise<Page> {
  const context = await page.context().browser()!.newContext();
  const p = await context.newPage();
  await login(p, "proprietario");
  return p;
}

test.describe("Revocación entre las dos aplicaciones (I-H1b)", () => {
  test("desactivar a un usuario en Nómina lo saca del inventario en un minuto como máximo", async ({ browser }) => {
    test.setTimeout(240_000);
    const admin = await sessionFor(browser, "admin");
    const propietario = await sessionFor(browser, "proprietario");
    const adminId = await userIdOf(propietario.page, "admin");

    // El ADMIN está trabajando en el inventario.
    await admin.page.goto(inv("/productos"));
    await expect(admin.page).toHaveURL(inv("/productos"));
    expect(await invApi(admin.page, "/api/products")).toBe(200);

    try {
      const off = await propietario.page.request.put(`/api/admin/users/${adminId}`, { data: { active: false } });
      expect(off.status()).toBe(200);

      // Inventory consulta a Nómina como mucho una vez por minuto: la sesión debe caer
      // en ese plazo (más un margen), sin que el usuario pase por Nómina.
      await expect
        .poll(() => invApi(admin.page, "/api/products"), { timeout: 90_000, intervals: [5_000] })
        .toBe(401);

      // Y la navegación lo devuelve al inicio de sesión de Nómina. Las páginas y la API de
      // Inventory guardan la respuesta de Nómina por separado (un minuto cada una), así que
      // una puede caer unos segundos después que la otra.
      await expect
        .poll(
          async () => {
            await admin.page.goto(inv("/productos"));
            return admin.page.url();
          },
          { timeout: 75_000, intervals: [5_000] },
        )
        .toMatch(new RegExp(`^${NOMINA_URL}/login`));
    } finally {
      const on = await propietario.page.request.put(`/api/admin/users/${adminId}`, { data: { active: true } });
      expect(on.status()).toBe(200);
    }

    // Reactivado, vuelve a entrar a las dos aplicaciones.
    await login(admin.page, "admin");
    await admin.page.goto(inv("/productos"));
    await expect(admin.page).toHaveURL(inv("/productos"));

    await admin.context.close();
    await propietario.context.close();
  });
});

test.describe("El canal de verificación de sesión", () => {
  test("[NEG] la cookie de sesión no sirve como token de la consulta de Inventory", async ({ page }) => {
    await login(page, "proprietario");
    const cookies = await page.context().cookies(NOMINA_URL);
    const sesion = cookies.find((c) => c.name.endsWith("session-token"));
    expect(sesion, "cookie de sesión de Nómina").toBeTruthy();

    // Una cookie robada va cifrada con otra sal: Nómina la rechaza en este canal.
    const res = await page.request.post("/api/inventory-permissions/session", {
      headers: { authorization: `Bearer ${sesion!.value}` },
    });
    expect(res.status()).toBe(401);
  });

  test("[NEG] una contraseña incorrecta en Nómina no deja sesión en el inventario", async ({ page }) => {
    await submitLogin(page, USERS.admin.username, "no-es-la-clave");
    await expect(page.getByText(LOGIN_ERROR)).toBeVisible();
    expect(await invApi(page, "/api/products")).toBe(401);
  });
});
