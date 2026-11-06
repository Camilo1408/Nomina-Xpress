// CP-45 y CP-46 (H3, H4): inicio de sesión con límite de intentos y sin enumeración
// de usuarios por tiempo de respuesta.

import { describe, it, expect, vi, beforeEach } from "vitest";

// next-auth no carga fuera de Next (importa "next/server"); su CredentialsSignin se
// reduce aquí a lo que usa LoginLockedError: un Error con `code`.
vi.mock("next-auth", () => ({
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
}));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return { ...actual, recordAudit: vi.fn(async () => {}) };
});
// bcrypt simulado: "hash" = "h:" + clave. Así se puede comprobar contra qué hash se
// comparó sin pagar el costo real de bcrypt en cada caso.
vi.mock("bcryptjs", () => {
  const compare = vi.fn(async (pw: string, hash: string) => hash === `h:${pw}`);
  const hash = vi.fn(async (pw: string) => `h:${pw}`);
  return { default: { compare, hash }, compare, hash };
});

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { authorizeCredentials, LoginLockedError } from "@/lib/login";
import type { ThrottleRecord, ThrottleStore } from "@/lib/login-throttle";

const findUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const compare = bcrypt.compare as unknown as ReturnType<typeof vi.fn>;
const audit = recordAudit as ReturnType<typeof vi.fn>;

const USER = {
  id: "u1", tenantId: "t1", username: "admin", role: "ADMIN", active: true,
  passwordHash: "h:clave-correcta", employeeId: null, sessionVersion: 3, employee: null,
};

function memoryStore(): ThrottleStore & { rows: Map<string, ThrottleRecord> } {
  const rows = new Map<string, ThrottleRecord>();
  return {
    rows,
    async get(key) { return rows.get(key) ?? null; },
    async set(key, rec) { rows.set(key, { ...rec }); },
    async remove(keys) { for (const k of keys) rows.delete(k); },
    async purgeStale() {},
  };
}

function req(ip = "1.2.3.4") {
  return new Request("http://localhost/api/auth/callback/credentials", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "user-agent": "vitest" },
  });
}

let store: ReturnType<typeof memoryStore>;
let now: Date;
const login = (username: string, password: string, ip?: string) =>
  authorizeCredentials({ username, password }, req(ip), { store, now: () => now });

beforeEach(() => {
  vi.clearAllMocks();
  store = memoryStore();
  now = new Date("2026-11-06T12:00:00Z");
  findUnique.mockImplementation(async ({ where }: { where: { username: string } }) =>
    where.username === USER.username ? USER : null
  );
});

describe("[CP-46] tiempos equivalentes (bcrypt siempre)", () => {
  it("usuario inexistente: compara contra un hash ficticio y responde null", async () => {
    expect(await login("fantasma", "lo-que-sea")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare.mock.calls[0][1]).not.toBe(USER.passwordHash);
    expect(audit).not.toHaveBeenCalled(); // sin tenant al cual asociar el evento
  });

  it("usuario desactivado con la clave correcta: también pasa por bcrypt y no entra", async () => {
    findUnique.mockResolvedValueOnce({ ...USER, active: false });
    expect(await login("admin", "clave-correcta")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toMatchObject({ action: "LOGIN_FAILED", result: "FAILURE" });
  });

  it("clave errónea: pasa por bcrypt, responde null y se audita", async () => {
    expect(await login("admin", "mala")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toMatchObject({ action: "LOGIN_FAILED", userId: "u1" });
  });

  it("clave correcta: devuelve el usuario con su sessionVersion y se audita el LOGIN", async () => {
    expect(await login("admin", "clave-correcta")).toMatchObject({
      id: "u1", name: "admin", role: "ADMIN", tenantId: "t1", sessionVersion: 3,
    });
    expect(audit.mock.calls[0][0]).toMatchObject({ action: "LOGIN" });
  });

  it("[NEG] sin usuario o sin clave no consulta la base", async () => {
    expect(await login("", "x")).toBeNull();
    expect(await login("admin", "")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("[CP-45] límite de intentos", () => {
  it("cinco fallos por usuario e IP; el sexto intento con la clave correcta queda bloqueado", async () => {
    for (let i = 0; i < 4; i++) expect(await login("admin", "mala")).toBeNull();
    // El quinto fallo dispara el bloqueo y se lo informa al usuario.
    await expect(login("admin", "mala")).rejects.toBeInstanceOf(LoginLockedError);
    await expect(login("admin", "clave-correcta")).rejects.toMatchObject({ code: "locked" });
    // Durante el bloqueo ni siquiera se consulta la base ni se compara la clave.
    const lookups = findUnique.mock.calls.length;
    await expect(login("admin", "clave-correcta")).rejects.toBeInstanceOf(LoginLockedError);
    expect(findUnique.mock.calls.length).toBe(lookups);
  });

  it("el bloqueo queda auditado en el tenant del usuario", async () => {
    for (let i = 0; i < 5; i++) await login("admin", "mala").catch(() => {});
    const last = audit.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ action: "LOGIN_FAILED", tenantId: "t1" });
    expect(last.description).toMatch(/bloquead/i);
  });

  it("el bloqueo se levanta solo a los 15 minutos", async () => {
    for (let i = 0; i < 5; i++) await login("admin", "mala").catch(() => {});
    now = new Date(now.getTime() + 15 * 60_000);
    expect(await login("admin", "clave-correcta")).toMatchObject({ id: "u1" });
  });

  it("otra IP sigue pudiendo entrar (el bloqueo es por usuario e IP)", async () => {
    for (let i = 0; i < 5; i++) await login("admin", "mala", "6.6.6.6").catch(() => {});
    expect(await login("admin", "clave-correcta", "7.7.7.7")).toMatchObject({ id: "u1" });
  });

  it("un usuario inexistente se bloquea igual (el bloqueo no revela qué usuarios existen)", async () => {
    for (let i = 0; i < 4; i++) await login("fantasma", "x");
    await expect(login("fantasma", "x")).rejects.toBeInstanceOf(LoginLockedError);
  });

  it("un login correcto borra los fallos previos", async () => {
    for (let i = 0; i < 4; i++) await login("admin", "mala");
    await login("admin", "clave-correcta");
    expect(store.rows.size).toBe(0);
    for (let i = 0; i < 4; i++) expect(await login("admin", "mala")).toBeNull();
  });

  it("[NEG] si el almacén de intentos falla, el login sigue funcionando", async () => {
    const broken: ThrottleStore = {
      get: vi.fn(async () => { throw new Error("no such table: LoginThrottle"); }),
      set: vi.fn(async () => { throw new Error("no such table: LoginThrottle"); }),
      remove: vi.fn(async () => { throw new Error("no such table: LoginThrottle"); }),
      purgeStale: vi.fn(async () => { throw new Error("no such table: LoginThrottle"); }),
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await authorizeCredentials(
      { username: "admin", password: "clave-correcta" }, req(), { store: broken, now: () => now },
    );
    expect(r).toMatchObject({ id: "u1" });
    expect(await authorizeCredentials(
      { username: "admin", password: "mala" }, req(), { store: broken, now: () => now },
    )).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
