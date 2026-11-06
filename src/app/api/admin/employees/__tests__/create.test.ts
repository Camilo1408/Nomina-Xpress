// RN-21 (con CP-49 y CP-50): POST /api/admin/employees no deja un empleado
// huérfano cuando el usuario de acceso ya existe.

import { describe, it, expect, vi, beforeEach } from "vitest";

let session: { user: { id: string; tenantId: string; role: string; name: string } } | null;
let allowed = true;

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "$2a$12$hash") } }));
vi.mock("@/lib/get-permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/get-permissions")>();
  return { ...actual, sessionCan: vi.fn(async () => allowed) };
});
vi.mock("@/lib/delegation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/delegation")>();
  return {
    ...actual,
    loadDelegationContext: vi.fn(async () => ({
      actorId: "yo", isOwner: true, grantable: new Set<string>(), anyDailyCategory: true,
    })),
  };
});

const tx = vi.hoisted(() => ({ employee: { create: vi.fn() }, user: { create: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    employee: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

import { prisma } from "@/lib/db";
import { POST } from "../route";

const findUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const outsideCreate = prisma.employee.create as ReturnType<typeof vi.fn>;

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/admin/employees", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const BASE = { name: "Ana Pérez" };
const WITH_ACCESS = { ...BASE, accessRole: "EMPLOYEE", username: "ana", password: "clave-segura-10" };

beforeEach(() => {
  vi.clearAllMocks();
  session = { user: { id: "yo", tenantId: "t1", role: "PROPRIETARY", name: "yo" } };
  allowed = true;
  findUnique.mockResolvedValue(null);
  tx.employee.create.mockResolvedValue({ id: "e1", name: "Ana Pérez" });
  tx.user.create.mockResolvedValue({ id: "u1" });
});

describe("POST /api/admin/employees", () => {
  it("[RN-21][NEG] usuario ya en uso ⇒ 409 y NO se crea el empleado", async () => {
    findUnique.mockResolvedValue({ id: "otro" });
    const res = await post(WITH_ACCESS);
    expect(res.status).toBe(409);
    expect(transaction).not.toHaveBeenCalled();
    expect(tx.employee.create).not.toHaveBeenCalled();
    expect(outsideCreate).not.toHaveBeenCalled();
  });

  it("[RN-21][NEG] carrera: el usuario se toma durante la transacción ⇒ 409 (se deshace)", async () => {
    tx.user.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    const res = await post(WITH_ACCESS);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "El nombre de usuario ya está en uso" });
  });

  it("[RN-21] con acceso ⇒ empleado y usuario en la MISMA transacción", async () => {
    const res = await post(WITH_ACCESS);
    expect(res.status).toBe(201);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.employee.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ username: "ana", role: "EMPLOYEE", employeeId: "e1", tenantId: "t1" }),
    });
    expect(outsideCreate).not.toHaveBeenCalled();
  });

  it("[RN-21] sin acceso ⇒ solo el empleado", async () => {
    expect((await post(BASE)).status).toBe(201);
    expect(tx.employee.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("[RN-21][NEG] acceso sin contraseña ⇒ 400 (antes creaba el empleado sin acceso en silencio)", async () => {
    const res = await post({ ...BASE, accessRole: "EMPLOYEE", username: "ana" });
    expect(res.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("[CP-49][NEG] cuerpo que no es JSON ⇒ 400", async () => {
    expect((await post("{nombre:")).status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("[CP-50] sin sesión ⇒ 401; con sesión pero sin employees:create ⇒ 403", async () => {
    session = null;
    expect((await post(BASE)).status).toBe(401);
    session = { user: { id: "yo", tenantId: "t1", role: "ADMIN", name: "yo" } };
    allowed = false;
    expect((await post(BASE)).status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });
});
