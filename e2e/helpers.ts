import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

// Usuarios de la semilla de prueba (prisma/seed-local.ts). Son credenciales públicas,
// documentadas en CLAUDE.md, que solo existen en la base efímera de estas pruebas.
export const USERS = {
  proprietario: { username: "proprietario", password: "proprietario123", home: "/admin/dashboard" },
  superadmin: { username: "superadmin", password: "superadmin123", home: "/admin/dashboard" },
  admin: { username: "admin", password: "admin123", home: "/admin/dashboard" },
  empleado: { username: "empleado", password: "empleado123", home: "/portal/report" },
  supervisor: { username: "SupervisorDemo", password: "Supervisor123", home: "/admin" },
} as const;

export type SeedUser = keyof typeof USERS;

export const LOGIN_ERROR = "Usuario o contraseña incorrectos.";
export const LOCKED_ERROR = "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.";

/** Llena y envía el formulario de inicio de sesión (sin esperar el resultado). */
export async function submitLogin(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

/** Inicia sesión por la interfaz y espera a llegar al portal que corresponde. */
export async function login(page: Page, who: SeedUser) {
  const user = USERS[who];
  await submitLogin(page, user.username, user.password);
  await page.waitForURL((url) => url.pathname.startsWith(user.home));
}

/** Contexto de navegador nuevo, con su propia sesión. */
export async function sessionFor(browser: Browser, who: SeedUser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, who);
  return { context, page };
}

/** Id de un usuario por su nombre, consultado con la sesión de `page` (necesita users:view). */
export async function userIdOf(page: Page, username: string): Promise<string> {
  const res = await page.request.get("/api/admin/users");
  expect(res.status()).toBe(200);
  const users: Array<{ id: string; username: string }> = await res.json();
  const found = users.find((u) => u.username === username);
  expect(found, `usuario ${username} en la semilla`).toBeTruthy();
  return found!.id;
}

/** ¿La sesión de `page` sigue viva? Lo responde el propio servidor de autenticación. */
export async function hasSession(page: Page): Promise<boolean> {
  const res = await page.request.get("/api/auth/session");
  const body: { user?: { id?: string } } | null = await res.json();
  return !!body?.user?.id;
}

/**
 * Registra lo que no debe pasar en ninguna página: errores de JavaScript, recursos
 * bloqueados por la CSP y respuestas 5xx. Llamar antes de navegar; revisar con `expectClean`.
 */
export function watchPage(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (err) => problems.push(`error de página: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy|Refused to/i.test(msg.text())) {
      problems.push(`CSP: ${msg.text()}`);
    }
  });
  page.on("response", (res) => {
    if (res.status() >= 500) problems.push(`${res.status()} en ${res.url()}`);
  });
  return {
    problems,
    expectClean: () => expect(problems, problems.join("\n")).toEqual([]),
  };
}
