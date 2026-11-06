// CP-45: POST /api/admin/users/[id]/unlock (solo PROPRIETARY y SUPERADMIN) y
// desbloqueo automático al restablecer la contraseña con PUT /api/admin/users/[id].

import { describe, it, expect, vi, beforeEach } from "vitest";

let session: { user: { id: string; tenantId: string; role: string; name: string } } | null;

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/get-permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/get-permissions")>();
  return { ...actual, sessionCan: vi.fn(async () => true) };
});
vi.mock("@/lib/login-throttle", () => ({
  unlockLogin: vi.fn(async () => 2),
  clearLoginLock: vi.fn(async () => {}),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: vi.fn(), update: vi.fn() },
    customRole: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { unlockLogin, clearLoginLock } from "@/lib/login-throttle";
import { POST } from "../[id]/unlock/route";
import { PUT } from "../[id]/route";

const findFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;
const update = prisma.user.update as ReturnType<typeof vi.fn>;

const TARGET = {
  id: "u2", tenantId: "t1", username: "cajero", role: "EMPLOYEE",
  customRoleId: null, active: true, passwordHash: "$2a$12$x", sessionVersion: 0,
};

const as = (role: string) => {
  session = { user: { id: "yo", tenantId: "t1", role, name: "yo" } };
};
const unlock = () =>
  POST(new Request("http://localhost/api/admin/users/u2/unlock", { method: "POST" }), {
    params: Promise.resolve({ id: "u2" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockImplementation(async ({ where }: { where: { id: string; tenantId: string } }) =>
    where.id === TARGET.id && where.tenantId === TARGET.tenantId ? TARGET : null
  );
  update.mockImplementation(async ({ data }) => ({ ...TARGET, ...data }));
});

describe("[CP-45] desbloquear inicio de sesión", () => {
  it("un SUPERADMIN desbloquea y queda auditado", async () => {
    as("SUPERADMIN");
    const res = await unlock();
    expect(res.status).toBe(200);
    expect(unlockLogin).toHaveBeenCalledWith("cajero");
    expect((logAudit as ReturnType<typeof vi.fn>).mock.calls[0][2]).toMatchObject({
      module: "USERS", entityId: "u2",
    });
  });

  it("un PROPRIETARY también puede", async () => {
    as("PROPRIETARY");
    expect((await unlock()).status).toBe(200);
  });

  it("[NEG] un ADMIN no puede (403) y no se borra nada", async () => {
    as("ADMIN");
    expect((await unlock()).status).toBe(403);
    expect(unlockLogin).not.toHaveBeenCalled();
  });

  it("[NEG] sin sesión ⇒ 401", async () => {
    session = null;
    expect((await unlock()).status).toBe(401);
  });

  it("[NEG] un usuario de otro tenant ⇒ 404", async () => {
    session = { user: { id: "yo", tenantId: "otro", role: "SUPERADMIN", name: "yo" } };
    expect((await unlock()).status).toBe(404);
    expect(unlockLogin).not.toHaveBeenCalled();
  });
});

describe("[CP-45] restablecer la contraseña desbloquea", () => {
  const put = (body: Record<string, unknown>) =>
    PUT(
      new Request("http://localhost/api/admin/users/u2", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "u2" }) },
    );

  it("con una clave nueva se borran los contadores del usuario", async () => {
    as("SUPERADMIN");
    expect((await put({ password: "una-clave-larga" })).status).toBe(200);
    expect(clearLoginLock).toHaveBeenCalledWith("cajero");
  });

  it("[NEG] sin cambiar la clave no se toca el bloqueo", async () => {
    as("SUPERADMIN");
    await put({ active: false });
    expect(clearLoginLock).not.toHaveBeenCalled();
  });

  it("[NEG] una clave de 9 caracteres se rechaza (400)", async () => {
    as("SUPERADMIN");
    expect((await put({ password: "123456789" })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
