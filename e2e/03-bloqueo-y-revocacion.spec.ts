// CP-45: bloqueo del inicio de sesión por intentos fallidos y desbloqueo.
// RN-19: desactivar un usuario o cambiar su clave cierra sus sesiones abiertas.
// RN-20: nadie se cambia a sí mismo el estado ni el rol.

import { expect, test } from "@playwright/test";
import { LOCKED_ERROR, LOGIN_ERROR, USERS, hasSession, login, sessionFor, submitLogin, userIdOf } from "./helpers";

test.describe("Bloqueo por intentos fallidos (CP-45)", () => {
  test("cinco fallos bloquean al usuario; un SUPERADMIN lo desbloquea y vuelve a entrar", async ({ page, browser }) => {
    const { username, password } = USERS.supervisor;

    // Cinco contraseñas incorrectas seguidas.
    for (let i = 1; i <= 5; i++) {
      await submitLogin(page, username, `clave-incorrecta-${i}`);
      await expect(page.getByText(i < 5 ? LOGIN_ERROR : LOCKED_ERROR).or(page.getByText(LOGIN_ERROR))).toBeVisible();
    }

    // Bloqueado: ni siquiera la contraseña correcta entra.
    await submitLogin(page, username, password);
    await expect(page.getByText(LOCKED_ERROR)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // El bloqueo es por usuario: otro usuario entra normalmente desde el mismo equipo.
    const propietario = await sessionFor(browser, "proprietario");
    const supervisorId = await userIdOf(propietario.page, username);
    await propietario.context.close();

    // Un ADMIN no puede desbloquear; un SUPERADMIN sí.
    const admin = await sessionFor(browser, "admin");
    expect((await admin.page.request.post(`/api/admin/users/${supervisorId}/unlock`)).status()).toBe(403);
    await admin.context.close();

    const superadmin = await sessionFor(browser, "superadmin");
    const unlock = await superadmin.page.request.post(`/api/admin/users/${supervisorId}/unlock`);
    expect(unlock.status()).toBe(200);
    await superadmin.context.close();

    // Desbloqueado: la contraseña correcta vuelve a funcionar.
    await submitLogin(page, username, password);
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  });
});

test.describe("Revocación de sesiones (RN-19)", () => {
  test("desactivar a un usuario cierra su sesión abierta; al reactivarlo vuelve a entrar", async ({ browser }) => {
    const admin = await sessionFor(browser, "admin");
    const propietario = await sessionFor(browser, "proprietario");
    const adminId = await userIdOf(propietario.page, "admin");

    // El administrador trabaja con normalidad.
    expect(await hasSession(admin.page)).toBe(true);

    try {
      const off = await propietario.page.request.put(`/api/admin/users/${adminId}`, { data: { active: false } });
      expect(off.status()).toBe(200);

      // Su siguiente petición ya no tiene sesión: la página lo devuelve al inicio de sesión
      // y la API deja de entregarle datos.
      await admin.page.goto("/admin/dashboard");
      await expect(admin.page).toHaveURL(/\/login$/);
      expect(await hasSession(admin.page)).toBe(false);
      const api = await admin.page.request.get("/api/admin/time-entries", { maxRedirects: 0 });
      expect(api.status()).toBe(307);

      // Desactivado, tampoco puede iniciar sesión de nuevo.
      await submitLogin(admin.page, USERS.admin.username, USERS.admin.password);
      await expect(admin.page.getByText(LOGIN_ERROR)).toBeVisible();
    } finally {
      const on = await propietario.page.request.put(`/api/admin/users/${adminId}`, { data: { active: true } });
      expect(on.status()).toBe(200);
    }

    await login(admin.page, "admin");
    await expect(admin.page).toHaveURL(/\/admin\/dashboard$/);
    await admin.context.close();
    await propietario.context.close();
  });

  test("restablecer la contraseña de un usuario cierra su sesión abierta", async ({ browser }) => {
    // Se usa al supervisor porque su clave de semilla cumple el mínimo de 10 caracteres,
    // así la prueba puede dejarla como estaba al terminar.
    const { username, password } = USERS.supervisor;
    const context = await browser.newContext();
    const page = await context.newPage();
    await submitLogin(page, username, password);
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    expect(await hasSession(page)).toBe(true);

    const propietario = await sessionFor(browser, "proprietario");
    const supervisorId = await userIdOf(propietario.page, username);
    const temporal = "Clave-temporal-e2e-1";

    try {
      const res = await propietario.page.request.put(`/api/admin/users/${supervisorId}`, { data: { password: temporal } });
      expect(res.status()).toBe(200);

      expect(await hasSession(page)).toBe(false);
      await page.goto("/admin/dashboard");
      await expect(page).toHaveURL(/\/login$/);

      // La clave anterior ya no sirve; la nueva sí.
      await submitLogin(page, username, password);
      await expect(page.getByText(LOGIN_ERROR)).toBeVisible();
      await submitLogin(page, username, temporal);
      await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    } finally {
      // Deja la semilla como estaba para las pruebas siguientes.
      const res = await propietario.page.request.put(`/api/admin/users/${supervisorId}`, { data: { password } });
      expect(res.status()).toBe(200);
    }
    await context.close();
    await propietario.context.close();
  });
});

test.describe("Techo de delegación (RN-20)", () => {
  test("[NEG] nadie se desactiva ni se cambia el rol a sí mismo, y el PROPRIETARY no se modifica", async ({ browser }) => {
    const superadmin = await sessionFor(browser, "superadmin");
    const propietario = await sessionFor(browser, "proprietario");
    const superId = await userIdOf(propietario.page, "superadmin");
    const propId = await userIdOf(propietario.page, "proprietario");

    // Sin users:edit, un SUPERADMIN no cambia el rol ni el estado de nadie (ni el suyo).
    // La respuesta es 403 (tiene sesión, no tiene permiso), no 401 (CP-50).
    const self = await superadmin.page.request.put(`/api/admin/users/${superId}`, { data: { active: false } });
    expect(self.status()).toBe(403);
    const escalar = await superadmin.page.request.put(`/api/admin/users/${propId}`, { data: { active: false } });
    expect(escalar.status()).toBe(403);

    // Ni el propio PROPRIETARY puede modificar su usuario por esta vía.
    const prop = await propietario.page.request.put(`/api/admin/users/${propId}`, { data: { active: false } });
    expect(prop.status()).toBe(403);

    // Nada cambió: los dos siguen pudiendo trabajar.
    expect((await propietario.page.request.get("/api/admin/users")).status()).toBe(200);
    await superadmin.page.goto("/admin/dashboard");
    await expect(superadmin.page).toHaveURL(/\/admin\/dashboard$/);

    await superadmin.context.close();
    await propietario.context.close();
  });
});
