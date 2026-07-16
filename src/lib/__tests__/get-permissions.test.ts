import { describe, it, expect } from "vitest";
import { hasAdminAreaAccess } from "../get-permissions";
import { PERMISSIONS, BASE_ROLE_PERMISSIONS } from "../permission-keys";

describe("hasAdminAreaAccess", () => {
  it("empleado base (sin permisos) NO tiene acceso al área admin", () => {
    const perms = new Set<string>(BASE_ROLE_PERMISSIONS.EMPLOYEE); // []
    expect(hasAdminAreaAccess(perms)).toBe(false);
  });

  it("un permiso admin cualquiera SÍ da acceso al área admin", () => {
    expect(hasAdminAreaAccess(new Set([PERMISSIONS.TIME_ENTRIES_VIEW]))).toBe(true);
  });

  it("solo profile:edit NO da acceso al área admin (es del portal)", () => {
    expect(hasAdminAreaAccess(new Set([PERMISSIONS.PROFILE_EDIT]))).toBe(false);
  });

  it("rol custom 'Supervisor de turno' (horas/horarios/propinas/nómina) da acceso", () => {
    const perms = new Set<string>([
      PERMISSIONS.TIME_ENTRIES_VIEW,
      PERMISSIONS.SCHEDULES_VIEW,
      PERMISSIONS.TIPS_VIEW,
      PERMISSIONS.PAYROLL_VIEW,
    ]);
    expect(hasAdminAreaAccess(perms)).toBe(true);
  });

  it("un rol base admin (permisos no vacíos) da acceso", () => {
    expect(hasAdminAreaAccess(new Set(BASE_ROLE_PERMISSIONS.ADMIN))).toBe(true);
  });

  it("set vacío → sin acceso", () => {
    expect(hasAdminAreaAccess(new Set())).toBe(false);
  });

  it("empleado SOLO con permisos de inventario NO entra al área admin (queda en su portal)", () => {
    const perms = new Set<string>([
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_STOCK_COUNT,
    ]);
    expect(hasAdminAreaAccess(perms)).toBe(false);
  });

  it("permisos dinámicos de inventario por categoría tampoco dan acceso al área admin", () => {
    const perms = new Set<string>([
      PERMISSIONS.INVENTORY_VIEW,
      "inventory:daily:cocina:view",
      "inventory:daily:cocina:open",
    ]);
    expect(hasAdminAreaAccess(perms)).toBe(false);
  });

  it("inventario + un permiso admin real SÍ da acceso al área admin", () => {
    const perms = new Set<string>([
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.TIME_ENTRIES_VIEW,
    ]);
    expect(hasAdminAreaAccess(perms)).toBe(true);
  });
});
