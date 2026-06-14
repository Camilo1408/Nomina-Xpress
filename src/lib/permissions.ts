// Roles disponibles
export type Role = "EMPLOYEE" | "ADMIN" | "SUPERADMIN" | "PROPRIETARY";

// Roles que pueden entrar al portal /admin
export const ADMIN_PORTAL_ROLES: Role[] = ["ADMIN", "SUPERADMIN", "PROPRIETARY"];

// Roles con privilegios completos sobre la mayoría de módulos (antes solo SUPERADMIN)
export const FULL_ADMIN_ROLES: Role[] = ["SUPERADMIN", "PROPRIETARY"];

// Solo PROPRIETARY puede agregar, desactivar o borrar empleados
export const EMPLOYEE_LIFECYCLE_ROLES: Role[] = ["PROPRIETARY"];

export function isFullAdmin(role: string | undefined | null): boolean {
  return role === "SUPERADMIN" || role === "PROPRIETARY";
}

export function isProprietary(role: string | undefined | null): boolean {
  return role === "PROPRIETARY";
}

export function isAdminPortal(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "SUPERADMIN" || role === "PROPRIETARY";
}

// Permisos específicos sobre empleados
export const canEditEmployee = (role: string | undefined | null) => isFullAdmin(role);
export const canAddEmployee = (role: string | undefined | null) => isProprietary(role);
export const canDeactivateEmployee = (role: string | undefined | null) => isProprietary(role);
export const canDeleteEmployee = (role: string | undefined | null) => isProprietary(role);

// Gestión de bonos: SUPERADMIN y PROPRIETARY (aunque SUPERADMIN no pueda crear/borrar empleados)
export const canManageBonuses = (role: string | undefined | null) => isFullAdmin(role);

// Gestión de descuentos: mismos roles que bonos (SUPERADMIN y PROPRIETARY)
export const canManageDiscounts = (role: string | undefined | null) => isFullAdmin(role);
