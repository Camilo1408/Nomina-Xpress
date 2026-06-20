// Constantes y etiquetas de auditoría — SIN dependencias de servidor (Prisma).
// Se puede importar tanto desde Server Components / rutas API como desde
// componentes cliente sin arrastrar el cliente de base de datos al bundle.

export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "ACTIVATE",
  "DEACTIVATE",
  "PUBLISH",
  "UNPUBLISH",
  "EXPORT",
  "PAYMENT",
  "LOGIN",
  "LOGOUT",
  "LOGIN_FAILED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_MODULES = [
  "AUTH",
  "EMPLOYEES",
  "TIME_ENTRIES",
  "SCHEDULES",
  "TIPS",
  "PAYROLL",
  "PAY_ADJUSTMENTS",
  "BONUSES",
  "DISCOUNTS",
  "CREDENTIALS",
  "SETTINGS",
  "PROFILE",
  "INVENTORY",
  "ROLES",
  "USERS",
] as const;
export type AuditModule = (typeof AUDIT_MODULES)[number];

export type AuditResult = "SUCCESS" | "FAILURE";

export const ACTION_LABELS: Record<string, string> = {
  CREATE: "Creación",
  UPDATE: "Edición",
  DELETE: "Eliminación",
  ACTIVATE: "Activación",
  DEACTIVATE: "Desactivación",
  PUBLISH: "Publicación",
  UNPUBLISH: "Despublicación",
  EXPORT: "Exportación",
  PAYMENT: "Registro de pago",
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
  LOGIN_FAILED: "Inicio fallido",
};

export const MODULE_LABELS: Record<string, string> = {
  AUTH: "Autenticación",
  EMPLOYEES: "Empleados",
  TIME_ENTRIES: "Registro de Horas",
  SCHEDULES: "Horarios",
  TIPS: "Propinas",
  PAYROLL: "Nómina",
  PAY_ADJUSTMENTS: "Ajustes de Pago",
  BONUSES: "Bonos",
  DISCOUNTS: "Descuentos",
  CREDENTIALS: "Credenciales",
  SETTINGS: "Configuración",
  PROFILE: "Perfil",
  INVENTORY: "Inventario",
  ROLES: "Roles y permisos",
  USERS: "Usuarios del portal",
};
