// I-H1b / RN-19: el estado de la sesión que consultan el callback jwt() de Nómina
// y el inventario (POST /api/inventory-permissions/session).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { user: { findFirst: vi.fn() } } }));
vi.mock("@/lib/inventory-permissions", () => ({
  resolveInventoryPermissions: vi.fn(async () => ["inventory:view", "inventory:stock:count"]),
}));

import { prisma } from "@/lib/db";
import { resolveInventoryPermissions } from "@/lib/inventory-permissions";
import { resolveSessionState } from "../session-state";

const findFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;
const resolvePerms = resolveInventoryPermissions as ReturnType<typeof vi.fn>;

const USER = { role: "EMPLOYEE", inventoryAccess: true, active: true, sessionVersion: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(USER);
});

describe("resolveSessionState", () => {
  it("[RN-19] sesión vigente ⇒ rol y permisos de inventario frescos", async () => {
    await expect(resolveSessionState("u1", "t1", 2)).resolves.toEqual({
      valid: true,
      role: "EMPLOYEE",
      inventoryAccess: true,
      inventoryPermissions: ["inventory:view", "inventory:stock:count"],
    });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1", tenantId: "t1" } }));
    expect(resolvePerms).toHaveBeenCalledWith("u1", "t1", "EMPLOYEE", true);
  });

  it("[RN-19][NEG][CP-43] usuario desactivado ⇒ inválida y sin calcular permisos", async () => {
    findFirst.mockResolvedValue({ ...USER, active: false });
    await expect(resolveSessionState("u1", "t1", 2)).resolves.toEqual({ valid: false });
    expect(resolvePerms).not.toHaveBeenCalled();
  });

  it("[RN-19][NEG] usuario eliminado o de otro tenant ⇒ inválida", async () => {
    findFirst.mockResolvedValue(null);
    await expect(resolveSessionState("u1", "otro", 2)).resolves.toEqual({ valid: false });
  });

  it("[RN-19][NEG][CP-44] versión anterior (clave o rol cambiados) ⇒ inválida", async () => {
    await expect(resolveSessionState("u1", "t1", 1)).resolves.toEqual({ valid: false });
  });

  it("[RN-19][LIM] token sin versión frente a sessionVersion 0 ⇒ vigente", async () => {
    findFirst.mockResolvedValue({ ...USER, sessionVersion: 0 });
    await expect(resolveSessionState("u1", "t1", undefined)).resolves.toMatchObject({ valid: true });
  });

  it("[RN-19] sin permisos de inventario ⇒ vigente pero inventoryAccess=false", async () => {
    resolvePerms.mockResolvedValueOnce([]);
    await expect(resolveSessionState("u1", "t1", 2)).resolves.toEqual({
      valid: true, role: "EMPLOYEE", inventoryAccess: false, inventoryPermissions: [],
    });
  });
});
