// RN-19: un usuario desactivado no conserva permisos efectivos, aunque su JWT
// todavía no haya expirado (defensa en profundidad junto a session-guard).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { user: { findFirst: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { getEffectivePermissions } from "../get-permissions";
import { PERMISSIONS } from "../permission-keys";

const findFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;

function user(overrides: Record<string, unknown>) {
  return { id: "u1", tenantId: "t1", role: "ADMIN", active: true, customRole: null, userPermissions: [], ...overrides };
}

beforeEach(() => vi.clearAllMocks());

describe("getEffectivePermissions con usuarios inactivos", () => {
  it("[RN-19] usuario ADMIN activo conserva sus permisos base", async () => {
    findFirst.mockResolvedValue(user({}));
    const perms = await getEffectivePermissions("u1", "t1");
    expect(perms.has(PERMISSIONS.TIME_ENTRIES_VIEW)).toBe(true);
  });

  it("[RN-19][NEG][CP-43] ADMIN desactivado ⇒ conjunto vacío", async () => {
    findFirst.mockResolvedValue(user({ active: false }));
    expect((await getEffectivePermissions("u1", "t1")).size).toBe(0);
  });

  it("[RN-19][NEG][CP-43] PROPRIETARY desactivado tampoco tiene bypass", async () => {
    findFirst.mockResolvedValue(user({ role: "PROPRIETARY", active: false }));
    expect((await getEffectivePermissions("u1", "t1")).size).toBe(0);
  });

  it("[RN-19][NEG] los overrides concedidos no reviven a un usuario desactivado", async () => {
    findFirst.mockResolvedValue(
      user({ active: false, userPermissions: [{ permissionKey: PERMISSIONS.USERS_EDIT, granted: true }] })
    );
    expect((await getEffectivePermissions("u1", "t1")).size).toBe(0);
  });

  it("[RN-13] la consulta filtra por id y tenantId de la sesión", async () => {
    findFirst.mockResolvedValue(null);
    await getEffectivePermissions("u1", "t1");
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "u1", tenantId: "t1" });
  });
});
