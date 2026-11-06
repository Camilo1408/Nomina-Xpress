// RN-20 (CP-47, CP-48) en las rutas reales: nadie se eleva a sí mismo, nadie
// otorga permisos que no tiene y nadie gestiona a alguien con más permisos.
// Además: el PROPRIETARY y el SUPERADMIN pueden restablecer contraseñas (CP-45)
// aunque no tengan users:edit, siempre dentro del techo.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS as P } from "@/lib/permission-keys";

type U = {
  id: string; tenantId: string; username: string; role: string; active: boolean;
  passwordHash: string; customRoleId: string | null; employeeId: string | null; sessionVersion: number;
  customRole: { permissions: string; active: boolean; tenantId: string } | null;
  userPermissions: { permissionKey: string; granted: boolean }[];
};

const T = "t1";
const mk = (id: string, role: string, extra: Partial<U> = {}): U => ({
  id, tenantId: T, username: id, role, active: true, passwordHash: "$2a$12$x",
  customRoleId: null, employeeId: null, sessionVersion: 0, customRole: null, userPermissions: [], ...extra,
});
const cr = (keys: string[]) => ({ permissions: JSON.stringify(keys), active: true, tenantId: T });

let users: Record<string, U>;
let session: { user: { id: string; tenantId: string; role: string; name: string } };
let roles: Record<string, { id: string; tenantId: string; permissions: string; active: boolean; isSystem: boolean; name: string }>;

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/login-throttle", () => ({ clearLoginLock: vi.fn(async () => {}) }));
vi.mock("@/lib/get-permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/get-permissions")>();
  return {
    ...actual,
    // Permisos reales del actor, calculados sobre la base simulada.
    sessionCan: vi.fn(async (s: typeof session, key: string) => {
      const u = users[s.user.id];
      return !!u && actual.resolvePermissionsSync(u, T).has(key);
    }),
  };
});
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const u = users[where.id];
        return u && u.tenantId === where.tenantId ? u : null;
      }),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<U> }) => ({ ...users[where.id], ...data })),
    },
    customRole: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const r = roles[where.id];
        return r && r.tenantId === where.tenantId ? r : null;
      }),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "nuevo", ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    },
    userPermission: { upsert: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 1 })) },
    employee: {
      // Empleado "e-<usuario>" vinculado al usuario del mismo nombre.
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        const u = users[where.id.replace(/^e-/, "")];
        return u ? { id: where.id, name: u.username, tenantId: T, user: u } : null;
      }),
    },
  },
}));

import { prisma } from "@/lib/db";
import { PUT as putUser } from "../[id]/route";
import { PUT as putPerms, DELETE as deletePerms } from "../[id]/permissions/route";
import { POST as postRole } from "../../roles/route";
import { PUT as putRole } from "../../roles/[id]/route";
import { POST as postUser } from "../route";
import { PUT as putCredentials } from "../../employees/[id]/credentials/route";

const userUpdate = prisma.user.update as ReturnType<typeof vi.fn>;
const upsert = prisma.userPermission.upsert as ReturnType<typeof vi.fn>;
const roleCreate = prisma.customRole.create as ReturnType<typeof vi.fn>;

const as = (id: string) => {
  const u = users[id];
  session = { user: { id, tenantId: T, role: u.role, name: id } };
};
const json = (method: string, body: unknown) =>
  new Request("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  users = {
    owner: mk("owner", "PROPRIETARY"),
    super: mk("super", "SUPERADMIN"),
    super2: mk("super2", "SUPERADMIN", {
      userPermissions: [{ permissionKey: P.USERS_EDIT, granted: true }],
    }),
    // Gestor de usuarios con rol personalizado acotado.
    gestor: mk("gestor", "EMPLOYEE", {
      customRoleId: "r-gestor",
      customRole: cr([P.USERS_VIEW, P.USERS_CREATE, P.USERS_EDIT, P.USERS_MANAGE_PERMISSIONS, P.USERS_DEACTIVATE,
        P.USERS_ASSIGN_ROLE, P.ROLES_CREATE, P.ROLES_EDIT, P.ROLES_VIEW, P.TIPS_VIEW]),
    }),
    emp: mk("emp", "EMPLOYEE"),
    empRevocado: mk("empRevocado", "EMPLOYEE", {
      customRole: cr([P.TIPS_VIEW, P.PAYROLL_VIEW]),
      customRoleId: "r-x",
      userPermissions: [{ permissionKey: P.PAYROLL_VIEW, granted: false }],
    }),
  };
  roles = {
    "r-super": { id: "r-super", tenantId: T, permissions: JSON.stringify([P.PAYROLL_VIEW]), active: true, isSystem: false, name: "Nómina" },
    "r-tips": { id: "r-tips", tenantId: T, permissions: JSON.stringify([P.TIPS_VIEW]), active: true, isSystem: false, name: "Propinas" },
  };
});

describe("[RN-20][CP-47] nadie se cambia a sí mismo rol, estado ni permisos", () => {
  it("cambiar su propio rol ⇒ 403 y sin cambios", async () => {
    as("super2");
    const res = await putUser(json("PUT", { role: "ADMIN" }), ctx("super2"));
    expect(res.status).toBe(403);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("desactivarse a sí mismo ⇒ 403", async () => {
    as("gestor");
    expect((await putUser(json("PUT", { active: false }), ctx("gestor"))).status).toBe(403);
  });

  it("asignarse otro rol personalizado ⇒ 403", async () => {
    as("gestor");
    expect((await putUser(json("PUT", { customRoleId: "r-tips" }), ctx("gestor"))).status).toBe(403);
  });

  it("darse permisos individuales a sí mismo ⇒ 403", async () => {
    as("gestor");
    const res = await putPerms(json("PUT", { overrides: [{ permissionKey: P.TIPS_VIEW, granted: true }] }), ctx("gestor"));
    expect(res.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("[RN-20][CP-48] nadie otorga permisos que no tiene", () => {
  it("otorgar una clave que el gestor no tiene ⇒ 403", async () => {
    as("gestor");
    const res = await putPerms(json("PUT", { overrides: [{ permissionKey: P.PAYROLL_VIEW, granted: true }] }), ctx("emp"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/no tienes/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("otorgar una clave que sí tiene ⇒ 200", async () => {
    as("gestor");
    const res = await putPerms(json("PUT", { overrides: [{ permissionKey: P.TIPS_VIEW, granted: true }] }), ctx("emp"));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("solo el PROPRIETARY otorga cualquier clave", async () => {
    as("owner");
    const res = await putPerms(json("PUT", { overrides: [{ permissionKey: P.PAYROLL_VIEW, granted: true }] }), ctx("emp"));
    expect(res.status).toBe(200);
  });

  it("[NEG] quitar un override que devolvería una clave que el gestor no tiene ⇒ 403", async () => {
    as("gestor");
    users.empRevocado.customRole = cr([P.TIPS_VIEW, P.PAYROLL_VIEW]);
    const res = await deletePerms(json("DELETE", { permissionKey: P.PAYROLL_VIEW }), ctx("empRevocado"));
    expect(res.status).toBe(403);
  });

  it("asignar el rol base SUPERADMIN sin tener sus permisos ⇒ 403", async () => {
    as("gestor");
    expect((await putUser(json("PUT", { role: "SUPERADMIN" }), ctx("emp"))).status).toBe(403);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("asignar un rol personalizado con claves que no tiene ⇒ 403; uno dentro de su techo ⇒ 200", async () => {
    as("gestor");
    expect((await putUser(json("PUT", { customRoleId: "r-super" }), ctx("emp"))).status).toBe(403);
    expect((await putUser(json("PUT", { customRoleId: "r-tips" }), ctx("emp"))).status).toBe(200);
  });

  it("crear un rol personalizado con claves que no tiene ⇒ 403", async () => {
    as("gestor");
    const res = await postRole(json("POST", { name: "Todo", slug: "todo", permissions: [P.PAYROLL_VIEW] }));
    expect(res.status).toBe(403);
    expect(roleCreate).not.toHaveBeenCalled();
  });

  it("editar un rol para agregarle claves que no tiene ⇒ 403", async () => {
    as("gestor");
    const res = await putRole(json("PUT", { permissions: [P.TIPS_VIEW, P.PAYROLL_VIEW] }), ctx("r-tips"));
    expect(res.status).toBe(403);
  });
});

describe("[RN-20] nadie gestiona a un usuario con más permisos", () => {
  it("el gestor no puede restablecer la clave de un SUPERADMIN", async () => {
    as("gestor");
    const res = await putUser(json("PUT", { password: "una-clave-larga" }), ctx("super"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/gestionar/);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("el gestor no puede desactivar a un SUPERADMIN", async () => {
    as("gestor");
    expect((await putUser(json("PUT", { active: false }), ctx("super"))).status).toBe(403);
  });
});

describe("[CP-45] recuperación de acceso por SUPERADMIN sin users:edit", () => {
  it("un SUPERADMIN restablece la clave de un empleado aunque no tenga users:edit", async () => {
    as("super");
    const res = await putUser(json("PUT", { password: "una-clave-larga" }), ctx("emp"));
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledTimes(1);
  });

  it("[NEG] sin users:edit, el SUPERADMIN no puede cambiar otra cosa que la clave", async () => {
    as("super");
    expect((await putUser(json("PUT", { password: "una-clave-larga", active: false }), ctx("emp"))).status).toBe(401);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("[NEG] un SUPERADMIN no restablece la clave de otro SUPERADMIN con más permisos", async () => {
    as("super");
    expect((await putUser(json("PUT", { password: "una-clave-larga" }), ctx("super2"))).status).toBe(403);
  });

  it("[NEG] nadie restablece su propia clave por esta vía (va por Mi perfil, que pide la actual)", async () => {
    as("super2");
    expect((await putUser(json("PUT", { password: "una-clave-larga" }), ctx("super2"))).status).toBe(403);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("[NEG] nadie modifica al PROPRIETARY", async () => {
    as("super2");
    expect((await putUser(json("PUT", { password: "una-clave-larga" }), ctx("owner"))).status).toBe(403);
  });
});

describe("[RN-20] alta de usuarios y credenciales del personal", () => {
  it("[CP-48] el gestor no crea un SUPERADMIN (tendría permisos que él no tiene)", async () => {
    as("gestor");
    const res = await postUser(json("POST", { username: "nuevo", password: "una-clave-larga", role: "SUPERADMIN" }));
    expect(res.status).toBe(403);
  });

  it("un SUPERADMIN da rol ADMIN a un empleado (ADMIN está dentro de sus permisos)", async () => {
    as("super");
    const res = await putCredentials(json("PUT", { role: "ADMIN" }), ctx("e-emp"));
    expect(res.status).toBe(200);
  });

  it("[NEG] un SUPERADMIN no restablece la clave de un empleado con más permisos que él", async () => {
    as("super");
    users.emp.userPermissions = [{ permissionKey: P.USERS_MANAGE_PERMISSIONS, granted: true }];
    const res = await putCredentials(json("PUT", { password: "una-clave-larga" }), ctx("e-emp"));
    expect(res.status).toBe(403);
  });

  it("[CP-47] nadie se cambia su propio rol desde credenciales del personal", async () => {
    as("super");
    users.super.employeeId = "e-super";
    const res = await putCredentials(json("PUT", { role: "EMPLOYEE" }), ctx("e-super"));
    expect(res.status).toBe(403);
  });
});
