// RN-20 (H5): techo de delegación. Nadie otorga permisos que no tiene; solo el
// PROPRIETARY otorga cualquier clave. Lógica pura, sin base de datos.

import { describe, it, expect } from "vitest";
import { buildDelegationContext, ungrantable, permissionsOf } from "@/lib/delegation";
import { PERMISSIONS, BASE_ROLE_PERMISSIONS, ALL_PERMISSION_KEYS } from "@/lib/permission-keys";

const T = "t1";
const role = (permissions: string[], active = true) => ({
  permissions: JSON.stringify(permissions), active, tenantId: T,
});

describe("[RN-20] buildDelegationContext / ungrantable", () => {
  it("el PROPRIETARY puede otorgar cualquier clave", () => {
    const ctx = buildDelegationContext({ id: "p", role: "PROPRIETARY" }, T);
    expect(ctx.isOwner).toBe(true);
    expect(ungrantable(ctx, ALL_PERMISSION_KEYS)).toEqual([]);
  });

  it("[CP-48] un SUPERADMIN no otorga una clave que su rol no tiene", () => {
    const ctx = buildDelegationContext({ id: "s", role: "SUPERADMIN" }, T);
    const missing = ALL_PERMISSION_KEYS.find(
      (k) => !BASE_ROLE_PERMISSIONS.SUPERADMIN.includes(k),
    )!;
    expect(missing).toBeDefined();
    expect(ungrantable(ctx, [missing])).toEqual([missing]);
    expect(ungrantable(ctx, BASE_ROLE_PERMISSIONS.SUPERADMIN)).toEqual([]);
  });

  it("[CP-48] con rol personalizado, el techo es ese rol más sus overrides", () => {
    const ctx = buildDelegationContext({
      id: "c", role: "EMPLOYEE",
      customRole: role([PERMISSIONS.USERS_MANAGE_PERMISSIONS, PERMISSIONS.TIPS_VIEW]),
      userPermissions: [
        { permissionKey: PERMISSIONS.SCHEDULES_VIEW, granted: true },
        { permissionKey: PERMISSIONS.TIPS_VIEW, granted: false },
      ],
    }, T);
    expect(ungrantable(ctx, [PERMISSIONS.SCHEDULES_VIEW])).toEqual([]);
    expect(ungrantable(ctx, [PERMISSIONS.TIPS_VIEW])).toEqual([PERMISSIONS.TIPS_VIEW]);
    expect(ungrantable(ctx, [PERMISSIONS.PAYROLL_VIEW])).toEqual([PERMISSIONS.PAYROLL_VIEW]);
  });

  it("un ADMIN o SUPERADMIN con su rol base puede delegar categorías del inventario diario", () => {
    // Por su rol operan todas las categorías (auth.ts), aunque la clave no esté en su set.
    for (const r of ["ADMIN", "SUPERADMIN"]) {
      const ctx = buildDelegationContext({ id: "a", role: r }, T);
      expect(ungrantable(ctx, ["inventory:daily:cocina:open"])).toEqual([]);
    }
  });

  it("[NEG] con rol personalizado, solo delega las categorías que tiene", () => {
    const ctx = buildDelegationContext({
      id: "c", role: "ADMIN", customRole: role(["inventory:daily:bar:view"]),
    }, T);
    expect(ungrantable(ctx, ["inventory:daily:bar:view"])).toEqual([]);
    expect(ungrantable(ctx, ["inventory:daily:cocina:view"])).toEqual(["inventory:daily:cocina:view"]);
  });

  it("[NEG] un actor desactivado o inexistente no puede otorgar nada", () => {
    expect(ungrantable(buildDelegationContext(null, T), [PERMISSIONS.TIPS_VIEW])).toEqual([PERMISSIONS.TIPS_VIEW]);
    const inactive = buildDelegationContext({ id: "x", role: "SUPERADMIN", active: false }, T);
    expect(ungrantable(inactive, [PERMISSIONS.TIPS_VIEW])).toEqual([PERMISSIONS.TIPS_VIEW]);
  });
});

describe("[RN-20] permissionsOf", () => {
  it("el PROPRIETARY tiene todas las claves (nadie más puede gestionarlo)", () => {
    expect(permissionsOf({ role: "PROPRIETARY" }, T).size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it("aplica rol personalizado activo y overrides", () => {
    const perms = permissionsOf({
      role: "ADMIN",
      customRole: role([PERMISSIONS.TIPS_VIEW]),
      userPermissions: [{ permissionKey: PERMISSIONS.SCHEDULES_VIEW, granted: true }],
    }, T);
    expect([...perms].sort()).toEqual([PERMISSIONS.SCHEDULES_VIEW, PERMISSIONS.TIPS_VIEW].sort());
  });

  it("un rol personalizado inactivo cae al rol base", () => {
    const perms = permissionsOf({ role: "ADMIN", customRole: role([PERMISSIONS.TIPS_VIEW], false) }, T);
    expect([...perms].sort()).toEqual([...BASE_ROLE_PERMISSIONS.ADMIN].sort());
  });
});
