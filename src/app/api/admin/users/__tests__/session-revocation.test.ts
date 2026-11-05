// RN-19 en la ruta real PUT /api/admin/users/[id]: desactivar, cambiar la clave
// o el rol incrementa sessionVersion (revoca sesiones); la auditoría nunca guarda
// el hash de la contraseña.

import { describe, it, expect, vi, beforeEach } from "vitest";

const SESSION = { user: { id: "owner", tenantId: "t1", role: "PROPRIETARY", name: "dueño" } };

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => SESSION) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/get-permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/get-permissions")>();
  return { ...actual, sessionCan: vi.fn(async () => true) };
});
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: vi.fn(), update: vi.fn() },
    customRole: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PUT } from "../[id]/route";

const findFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;
const update = prisma.user.update as ReturnType<typeof vi.fn>;
const audit = logAudit as ReturnType<typeof vi.fn>;

const TARGET = {
  id: "u2", tenantId: "t1", username: "adminturno", role: "ADMIN",
  customRoleId: null, active: true, passwordHash: "$2a$12$hash-anterior", sessionVersion: 0,
};

function put(body: Record<string, unknown>) {
  return PUT(
    new Request("http://localhost/api/admin/users/u2", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "u2" }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(TARGET);
  update.mockImplementation(async ({ data }) => ({ ...TARGET, ...data }));
});

const revoked = () => update.mock.calls[0][0].data.sessionVersion;

describe("PUT /api/admin/users/[id] — revocación de sesiones", () => {
  it("[RN-19][CP-43] desactivar al usuario incrementa sessionVersion", async () => {
    const res = await put({ active: false });
    expect(res.status).toBe(200);
    expect(revoked()).toEqual({ increment: 1 });
  });

  it("[RN-19][CP-44] restablecer la contraseña incrementa sessionVersion", async () => {
    await put({ password: "NuevaClave2026" });
    expect(revoked()).toEqual({ increment: 1 });
  });

  it("[RN-19] cambiar el rol base incrementa sessionVersion", async () => {
    await put({ role: "SUPERADMIN" });
    expect(revoked()).toEqual({ increment: 1 });
  });

  it("[RN-19][NEG] reactivar a un usuario activo sin otros cambios no revoca", async () => {
    await put({ active: true });
    expect(revoked()).toBeUndefined();
  });

  it("[RN-19][NEG] el filtro por tenant se aplica antes de escribir (otro tenant ⇒ 404)", async () => {
    findFirst.mockResolvedValue(null);
    const res = await put({ active: false });
    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("[NEG][CP-54] la auditoría no guarda el hash de la nueva contraseña", async () => {
    await put({ password: "NuevaClave2026" });
    const entry = audit.mock.calls[0][2];
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("$2");
    expect(serialized).not.toContain("passwordHash");
    expect(entry.after.password).toBe("(cambiada)");
  });

  it("[NEG] la respuesta nunca incluye passwordHash", async () => {
    const res = await put({ password: "NuevaClave2026" });
    expect(JSON.stringify(await res.json())).not.toContain("passwordHash");
  });
});
