// I-H1b: POST /api/inventory-permissions/session. Inventory pregunta si la sesión
// que atiende sigue vigente; la consulta va cifrada con NEXTAUTH_SECRET y una sal
// propia, así que ni una cookie de sesión robada ni un token ajeno sirven.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encode } from "next-auth/jwt";

vi.mock("@/lib/db", () => ({ prisma: { user: { findFirst: vi.fn() } } }));
vi.mock("@/lib/inventory-permissions", () => ({
  resolveInventoryPermissions: vi.fn(async () => ["inventory:view"]),
}));

import { prisma } from "@/lib/db";
import { SESSION_CHECK_SALT } from "@/lib/session-state";
import { POST } from "../session/route";

const SECRET = "secreto-de-prueba-de-32-caracteres!!";
const findFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;

const token = (claims: Record<string, unknown>, opts: { salt?: string; secret?: string; maxAge?: number } = {}) =>
  encode({
    token: claims,
    secret: opts.secret ?? SECRET,
    salt: opts.salt ?? SESSION_CHECK_SALT,
    maxAge: opts.maxAge ?? 120,
  });

const call = (authorization?: string) =>
  POST(
    new Request("http://localhost/api/inventory-permissions/session", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    }),
  );

const savedSecret = { auth: process.env.AUTH_SECRET, next: process.env.NEXTAUTH_SECRET };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AUTH_SECRET;
  process.env.NEXTAUTH_SECRET = SECRET;
  findFirst.mockResolvedValue({ role: "ADMIN", inventoryAccess: false, active: true, sessionVersion: 1 });
});

afterEach(() => {
  process.env.AUTH_SECRET = savedSecret.auth;
  process.env.NEXTAUTH_SECRET = savedSecret.next;
  if (savedSecret.auth === undefined) delete process.env.AUTH_SECRET;
  if (savedSecret.next === undefined) delete process.env.NEXTAUTH_SECRET;
});

describe("POST /api/inventory-permissions/session", () => {
  it("[RN-19] sesión vigente ⇒ 200 con rol y permisos frescos, sin caché", async () => {
    const res = await call(`Bearer ${await token({ id: "u1", tenantId: "t1", sv: 1 })}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({
      valid: true, role: "ADMIN", inventoryAccess: true, inventoryPermissions: ["inventory:view"],
    });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1", tenantId: "t1" } }));
  });

  it("[RN-19][NEG][CP-44] sesión revocada en Nómina ⇒ 200 { valid: false }", async () => {
    const res = await call(`Bearer ${await token({ id: "u1", tenantId: "t1", sv: 0 })}`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: false });
  });

  it("[NEG] sin Authorization ⇒ 401 y no consulta la base", async () => {
    expect((await call()).status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("[NEG] una cookie de sesión robada (otra sal) no sirve como credencial ⇒ 401", async () => {
    const cookie = await token({ id: "u1", tenantId: "t1", sv: 1 }, { salt: "__Secure-nx.session-token" });
    expect((await call(`Bearer ${cookie}`)).status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("[NEG] token cifrado con otro secreto ⇒ 401", async () => {
    const forged = await token({ id: "u1", tenantId: "t1", sv: 1 }, { secret: "otro-secreto-de-32-caracteres-xxxxx" });
    expect((await call(`Bearer ${forged}`)).status).toBe(401);
  });

  it("[NEG][LIM] token de consulta vencido ⇒ 401", async () => {
    const old = await token({ id: "u1", tenantId: "t1", sv: 1 }, { maxAge: -3600 });
    expect((await call(`Bearer ${old}`)).status).toBe(401);
  });

  it("[NEG] token sin id o sin tenantId ⇒ 400", async () => {
    expect((await call(`Bearer ${await token({ tenantId: "t1", sv: 1 })}`)).status).toBe(400);
    expect((await call(`Bearer ${await token({ id: "u1", sv: 1 })}`)).status).toBe(400);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("[NEG] sin NEXTAUTH_SECRET configurado ⇒ 503 (nunca queda abierto)", async () => {
    delete process.env.NEXTAUTH_SECRET;
    expect((await call("Bearer x")).status).toBe(503);
  });
});
