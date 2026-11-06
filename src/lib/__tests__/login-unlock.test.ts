// CP-45: desbloqueo del inicio de sesión por un PROPRIETARY/SUPERADMIN y al
// restablecer la contraseña.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { loginThrottle: { findMany: vi.fn(), deleteMany: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { unlockLogin, lockedUsernames, clearLoginLock } from "@/lib/login-throttle";

const findMany = prisma.loginThrottle.findMany as ReturnType<typeof vi.fn>;
const deleteMany = prisma.loginThrottle.deleteMany as ReturnType<typeof vi.fn>;

const NOW = new Date("2026-11-06T12:00:00Z");
const LATER = new Date("2026-11-06T12:10:00Z");

type Row = { key: string; lockedUntil: Date | null };
let rows: Row[];

beforeEach(() => {
  vi.clearAllMocks();
  rows = [
    { key: "u:maria", lockedUntil: LATER },
    { key: "u:maria|ip:1.1.1.1", lockedUntil: LATER },
    { key: "u:maria|ip:2.2.2.2", lockedUntil: null },
    // "maria_x" empieza igual que "maria" en un LIKE con comodines: no debe tocarse.
    { key: "u:maria_x|ip:1.1.1.1", lockedUntil: LATER },
    { key: "u:mariaxip", lockedUntil: null },
    { key: "u:pedro|ip:3.3.3.3", lockedUntil: new Date("2026-11-06T11:00:00Z") },
  ];
  findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    if ("lockedUntil" in where) {
      const gt = (where.lockedUntil as { gt: Date }).gt;
      return rows.filter((r) => r.lockedUntil && r.lockedUntil > gt);
    }
    // Simula un LIKE de SQLite sin escapar: "_" vale por cualquier carácter.
    const prefix = (where.key as { startsWith: string }).startsWith;
    const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, "."));
    return rows.filter((r) => re.test(r.key));
  });
  deleteMany.mockImplementation(async ({ where }: { where: { key: { in: string[] } } }) => {
    const before = rows.length;
    rows = rows.filter((r) => !where.key.in.includes(r.key));
    return { count: before - rows.length };
  });
});

describe("[CP-45] unlockLogin", () => {
  it("borra el contador del usuario y los de todas sus IPs, y nada más", async () => {
    expect(await unlockLogin("Maria")).toBe(3);
    expect(rows.map((r) => r.key)).toEqual([
      "u:maria_x|ip:1.1.1.1",
      "u:mariaxip",
      "u:pedro|ip:3.3.3.3",
    ]);
  });

  it("[NEG] un usuario sin contadores no borra nada", async () => {
    expect(await unlockLogin("nadie")).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe("[CP-45] lockedUsernames", () => {
  it("devuelve los usuarios con un bloqueo vigente (por usuario o por IP)", async () => {
    const set = await lockedUsernames(NOW);
    expect([...set].sort()).toEqual(["maria", "maria_x"]);
  });
});

describe("[CP-45] clearLoginLock", () => {
  it("desbloquea sin lanzar aunque la tabla no exista", async () => {
    findMany.mockRejectedValueOnce(new Error("no such table: LoginThrottle"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(clearLoginLock("maria")).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
