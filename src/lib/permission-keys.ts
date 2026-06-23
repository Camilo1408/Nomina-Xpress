// Claves de permisos del sistema — sin dependencias de servidor.
// Importable tanto desde Server Components / API routes como desde cliente.

export const PERMISSIONS = {
  // ── Usuarios del portal ────────────────────────────────────────────────────
  USERS_VIEW:               "users:view",
  USERS_CREATE:             "users:create",
  USERS_EDIT:               "users:edit",
  USERS_DEACTIVATE:         "users:deactivate",
  USERS_ASSIGN_ROLE:        "users:assign_role",
  USERS_MANAGE_PERMISSIONS: "users:manage_permissions",

  // ── Empleados pagables ─────────────────────────────────────────────────────
  EMPLOYEES_VIEW:           "employees:view",
  EMPLOYEES_CREATE:         "employees:create",
  EMPLOYEES_EDIT:           "employees:edit",
  EMPLOYEES_DEACTIVATE:     "employees:deactivate",
  EMPLOYEES_DELETE:         "employees:delete",
  EMPLOYEES_CREDENTIALS:    "employees:credentials",

  // ── Roles y permisos ──────────────────────────────────────────────────────
  ROLES_VIEW:               "roles:view",
  ROLES_CREATE:             "roles:create",
  ROLES_EDIT:               "roles:edit",
  ROLES_DEACTIVATE:         "roles:deactivate",

  // ── Registro de horas ─────────────────────────────────────────────────────
  TIME_ENTRIES_VIEW:        "time_entries:view",
  TIME_ENTRIES_CREATE:      "time_entries:create",
  TIME_ENTRIES_EDIT:        "time_entries:edit",
  TIME_ENTRIES_DELETE:      "time_entries:delete",

  // ── Horarios ──────────────────────────────────────────────────────────────
  SCHEDULES_VIEW:           "schedules:view",
  SCHEDULES_CREATE:         "schedules:create",
  SCHEDULES_EDIT:           "schedules:edit",
  SCHEDULES_DELETE:         "schedules:delete",
  SCHEDULES_PUBLISH:        "schedules:publish",

  // ── Propinas ──────────────────────────────────────────────────────────────
  TIPS_VIEW:                "tips:view",
  TIPS_CREATE:              "tips:create",
  TIPS_EDIT:                "tips:edit",
  TIPS_DELETE:              "tips:delete",

  // ── Nómina y reportes ─────────────────────────────────────────────────────
  PAYROLL_VIEW:             "payroll:view",
  PAYROLL_GENERATE:         "payroll:generate",
  PAYROLL_EXPORT_PDF:       "payroll:export_pdf",
  PAYROLL_EXPORT_EXCEL:     "payroll:export_excel",

  // ── Ajustes de pago ───────────────────────────────────────────────────────
  PAY_ADJUSTMENTS_VIEW:     "pay_adjustments:view",
  PAY_ADJUSTMENTS_CREATE:   "pay_adjustments:create",
  PAY_ADJUSTMENTS_EDIT:     "pay_adjustments:edit",
  PAY_ADJUSTMENTS_DELETE:   "pay_adjustments:delete",

  // ── Bonos ─────────────────────────────────────────────────────────────────
  BONUSES_VIEW:             "bonuses:view",
  BONUSES_CREATE:           "bonuses:create",
  BONUSES_EDIT:             "bonuses:edit",
  BONUSES_DELETE:           "bonuses:delete",
  BONUSES_ASSIGN:           "bonuses:assign",

  // ── Descuentos ────────────────────────────────────────────────────────────
  DISCOUNTS_VIEW:           "discounts:view",
  DISCOUNTS_CREATE:         "discounts:create",
  DISCOUNTS_EDIT:           "discounts:edit",
  DISCOUNTS_DELETE:         "discounts:delete",
  DISCOUNTS_ASSIGN:         "discounts:assign",

  // ── Configuración ─────────────────────────────────────────────────────────
  SETTINGS_VIEW:            "settings:view",
  SETTINGS_EDIT:            "settings:edit",

  // ── Auditoría ─────────────────────────────────────────────────────────────
  AUDIT_VIEW:               "audit:view",

  // ── Inventario (módulo externo, enforced por el app de inventario vía JWT) ──
  INVENTORY_VIEW:               "inventory:view",                // acceder al inventario
  INVENTORY_PRODUCTS_CREATE:    "inventory:products:create",     // crear productos
  INVENTORY_PRODUCTS_EDIT:      "inventory:products:edit",       // editar productos
  INVENTORY_PRODUCTS_DELETE:    "inventory:products:delete",     // eliminar/desactivar productos
  INVENTORY_CATEGORIES_MANAGE:  "inventory:categories:manage",   // crear/editar categorías
  INVENTORY_STOCK_COUNT:        "inventory:stock:count",         // registrar movimientos / inventario diario
  INVENTORY_STOCK_ADJUST:       "inventory:stock:adjust",        // ajustes manuales de stock
  INVENTORY_DAILY_REOPEN:       "inventory:daily:reopen",        // reabrir inventario diario cerrado
  INVENTORY_REPORTS_VIEW:       "inventory:reports:view",        // ver reportes de inventario
  INVENTORY_USERS_MANAGE:       "inventory:users:manage",        // gestionar usuarios del inventario (standalone)

  // ── Perfil propio ─────────────────────────────────────────────────────────
  PROFILE_EDIT:             "profile:edit",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS) as PermissionKey[];

// Subconjunto de claves del módulo de inventario. El app de inventario las
// consume desde el JWT para enforcing granular. Útil para filtrar los permisos
// efectivos que se transmiten al sistema externo.
export const INVENTORY_PERMISSION_KEYS = ALL_PERMISSION_KEYS.filter((k) =>
  k.startsWith("inventory:")
) as PermissionKey[];

// ─── Permisos DINÁMICOS de inventario diario POR CATEGORÍA ───────────────────
// Contrato con el inventario: por cada categoría raíz (identificada por su slug)
// existen 5 claves. No son estáticas (dependen de las categorías), por eso viven
// fuera de PERMISSIONS y se validan por patrón.
//   inventory:daily:<slug>:view | open | close | edit | history
export type DailyAction = "view" | "open" | "close" | "edit" | "history";
export const DAILY_ACTIONS: DailyAction[] = ["view", "open", "close", "edit", "history"];

export const DAILY_ACTION_LABELS: Record<DailyAction, string> = {
  view: "Ver",
  open: "Abrir jornada",
  close: "Cerrar jornada",
  edit: "Reabrir/editar",
  history: "Historial",
};

export function dailyCategoryKey(slug: string, action: DailyAction): string {
  return `inventory:daily:${slug}:${action}`;
}

export function dailyCategoryKeys(slug: string): string[] {
  return DAILY_ACTIONS.map((a) => dailyCategoryKey(slug, a));
}

// Valida que una clave sea del formato dinámico de inventario diario por categoría.
const DAILY_KEY_RE = /^inventory:daily:([a-z0-9-]+):(view|open|close|edit|history)$/;
export function isDailyCategoryKey(key: string): boolean {
  return DAILY_KEY_RE.test(key);
}

export function parseDailyCategoryKey(key: string): { slug: string; action: DailyAction } | null {
  const m = key.match(DAILY_KEY_RE);
  if (!m) return null;
  return { slug: m[1], action: m[2] as DailyAction };
}

// Etiqueta legible para cualquier clave (estática o dinámica por categoría).
// `nameBySlug` mapea slug → nombre de categoría para las claves dinámicas.
export function permissionLabel(key: string, nameBySlug?: Map<string, string>): string {
  if (PERMISSION_LABELS[key]) return PERMISSION_LABELS[key];
  const parsed = parseDailyCategoryKey(key);
  if (parsed) {
    const name = nameBySlug?.get(parsed.slug) ?? parsed.slug;
    return `${name} · ${DAILY_ACTION_LABELS[parsed.action]}`;
  }
  return key;
}

// Una clave de permiso es válida si está en el catálogo estático o es una clave
// dinámica de inventario diario por categoría.
export function isValidPermissionKey(key: string): boolean {
  return ALL_PERMISSION_KEYS.includes(key as PermissionKey) || isDailyCategoryKey(key);
}

// ─── Permisos por rol base del sistema ────────────────────────────────────────
// Cuando un usuario NO tiene un rol personalizado, estos son sus permisos efectivos.
// PROPRIETARY siempre tiene TODOS los permisos (se calcula dinámicamente).

export const BASE_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  EMPLOYEE: [],

  ADMIN: [
    PERMISSIONS.TIME_ENTRIES_VIEW,
    PERMISSIONS.TIME_ENTRIES_CREATE,
    PERMISSIONS.TIME_ENTRIES_EDIT,
    PERMISSIONS.TIME_ENTRIES_DELETE,
    PERMISSIONS.SCHEDULES_VIEW,
    PERMISSIONS.TIPS_VIEW,
    PERMISSIONS.TIPS_CREATE,
    PERMISSIONS.TIPS_EDIT,
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_GENERATE,
    PERMISSIONS.PAYROLL_EXPORT_PDF,
    PERMISSIONS.PAYROLL_EXPORT_EXCEL,
    // Inventario: gestión completa (regla de negocio — ADMIN gestiona todo)
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_PRODUCTS_CREATE,
    PERMISSIONS.INVENTORY_PRODUCTS_EDIT,
    PERMISSIONS.INVENTORY_PRODUCTS_DELETE,
    PERMISSIONS.INVENTORY_CATEGORIES_MANAGE,
    PERMISSIONS.INVENTORY_STOCK_COUNT,
    PERMISSIONS.INVENTORY_STOCK_ADJUST,
    PERMISSIONS.INVENTORY_DAILY_REOPEN,
    PERMISSIONS.INVENTORY_REPORTS_VIEW,
    PERMISSIONS.INVENTORY_USERS_MANAGE,
    PERMISSIONS.PROFILE_EDIT,
  ],

  SUPERADMIN: [
    PERMISSIONS.EMPLOYEES_VIEW,
    PERMISSIONS.EMPLOYEES_CREATE,
    PERMISSIONS.EMPLOYEES_EDIT,
    PERMISSIONS.EMPLOYEES_DEACTIVATE,
    PERMISSIONS.EMPLOYEES_CREDENTIALS,
    PERMISSIONS.TIME_ENTRIES_VIEW,
    PERMISSIONS.TIME_ENTRIES_CREATE,
    PERMISSIONS.TIME_ENTRIES_EDIT,
    PERMISSIONS.TIME_ENTRIES_DELETE,
    PERMISSIONS.SCHEDULES_VIEW,
    PERMISSIONS.SCHEDULES_CREATE,
    PERMISSIONS.SCHEDULES_EDIT,
    PERMISSIONS.SCHEDULES_DELETE,
    PERMISSIONS.SCHEDULES_PUBLISH,
    PERMISSIONS.TIPS_VIEW,
    PERMISSIONS.TIPS_CREATE,
    PERMISSIONS.TIPS_EDIT,
    PERMISSIONS.TIPS_DELETE,
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_GENERATE,
    PERMISSIONS.PAYROLL_EXPORT_PDF,
    PERMISSIONS.PAYROLL_EXPORT_EXCEL,
    PERMISSIONS.PAY_ADJUSTMENTS_VIEW,
    PERMISSIONS.PAY_ADJUSTMENTS_CREATE,
    PERMISSIONS.PAY_ADJUSTMENTS_EDIT,
    PERMISSIONS.PAY_ADJUSTMENTS_DELETE,
    PERMISSIONS.BONUSES_VIEW,
    PERMISSIONS.BONUSES_CREATE,
    PERMISSIONS.BONUSES_EDIT,
    PERMISSIONS.BONUSES_DELETE,
    PERMISSIONS.BONUSES_ASSIGN,
    PERMISSIONS.DISCOUNTS_VIEW,
    PERMISSIONS.DISCOUNTS_CREATE,
    PERMISSIONS.DISCOUNTS_EDIT,
    PERMISSIONS.DISCOUNTS_DELETE,
    PERMISSIONS.DISCOUNTS_ASSIGN,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_EDIT,
    // Inventario: gestión completa
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_PRODUCTS_CREATE,
    PERMISSIONS.INVENTORY_PRODUCTS_EDIT,
    PERMISSIONS.INVENTORY_PRODUCTS_DELETE,
    PERMISSIONS.INVENTORY_CATEGORIES_MANAGE,
    PERMISSIONS.INVENTORY_STOCK_COUNT,
    PERMISSIONS.INVENTORY_STOCK_ADJUST,
    PERMISSIONS.INVENTORY_DAILY_REOPEN,
    PERMISSIONS.INVENTORY_REPORTS_VIEW,
    PERMISSIONS.INVENTORY_USERS_MANAGE,
    PERMISSIONS.PROFILE_EDIT,
  ],

  // PROPRIETARY: todos los permisos — calculado dinámicamente en getEffectivePermissions()
  PROPRIETARY: [],
};

// ─── Grupos de permisos por módulo (para la UI de la matriz) ──────────────────
export const PERMISSION_GROUPS: Array<{
  module: string;
  label: string;
  keys: PermissionKey[];
}> = [
  {
    module: "users",
    label: "Usuarios del portal",
    keys: [
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_EDIT,
      PERMISSIONS.USERS_DEACTIVATE,
      PERMISSIONS.USERS_ASSIGN_ROLE,
      PERMISSIONS.USERS_MANAGE_PERMISSIONS,
    ],
  },
  {
    module: "employees",
    label: "Empleados",
    keys: [
      PERMISSIONS.EMPLOYEES_VIEW,
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_EDIT,
      PERMISSIONS.EMPLOYEES_DEACTIVATE,
      PERMISSIONS.EMPLOYEES_DELETE,
      PERMISSIONS.EMPLOYEES_CREDENTIALS,
    ],
  },
  {
    module: "roles",
    label: "Roles y permisos",
    keys: [
      PERMISSIONS.ROLES_VIEW,
      PERMISSIONS.ROLES_CREATE,
      PERMISSIONS.ROLES_EDIT,
      PERMISSIONS.ROLES_DEACTIVATE,
    ],
  },
  {
    module: "time_entries",
    label: "Registro de horas",
    keys: [
      PERMISSIONS.TIME_ENTRIES_VIEW,
      PERMISSIONS.TIME_ENTRIES_CREATE,
      PERMISSIONS.TIME_ENTRIES_EDIT,
      PERMISSIONS.TIME_ENTRIES_DELETE,
    ],
  },
  {
    module: "schedules",
    label: "Horarios",
    keys: [
      PERMISSIONS.SCHEDULES_VIEW,
      PERMISSIONS.SCHEDULES_CREATE,
      PERMISSIONS.SCHEDULES_EDIT,
      PERMISSIONS.SCHEDULES_DELETE,
      PERMISSIONS.SCHEDULES_PUBLISH,
    ],
  },
  {
    module: "tips",
    label: "Propinas",
    keys: [
      PERMISSIONS.TIPS_VIEW,
      PERMISSIONS.TIPS_CREATE,
      PERMISSIONS.TIPS_EDIT,
      PERMISSIONS.TIPS_DELETE,
    ],
  },
  {
    module: "payroll",
    label: "Nómina y reportes",
    keys: [
      PERMISSIONS.PAYROLL_VIEW,
      PERMISSIONS.PAYROLL_GENERATE,
      PERMISSIONS.PAYROLL_EXPORT_PDF,
      PERMISSIONS.PAYROLL_EXPORT_EXCEL,
    ],
  },
  {
    module: "pay_adjustments",
    label: "Ajustes de pago",
    keys: [
      PERMISSIONS.PAY_ADJUSTMENTS_VIEW,
      PERMISSIONS.PAY_ADJUSTMENTS_CREATE,
      PERMISSIONS.PAY_ADJUSTMENTS_EDIT,
      PERMISSIONS.PAY_ADJUSTMENTS_DELETE,
    ],
  },
  {
    module: "bonuses",
    label: "Bonos",
    keys: [
      PERMISSIONS.BONUSES_VIEW,
      PERMISSIONS.BONUSES_CREATE,
      PERMISSIONS.BONUSES_EDIT,
      PERMISSIONS.BONUSES_DELETE,
      PERMISSIONS.BONUSES_ASSIGN,
    ],
  },
  {
    module: "discounts",
    label: "Descuentos",
    keys: [
      PERMISSIONS.DISCOUNTS_VIEW,
      PERMISSIONS.DISCOUNTS_CREATE,
      PERMISSIONS.DISCOUNTS_EDIT,
      PERMISSIONS.DISCOUNTS_DELETE,
      PERMISSIONS.DISCOUNTS_ASSIGN,
    ],
  },
  {
    module: "settings",
    label: "Configuración",
    keys: [PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT],
  },
  {
    module: "audit",
    label: "Auditoría",
    keys: [PERMISSIONS.AUDIT_VIEW],
  },
  {
    module: "inventory",
    label: "Inventario",
    keys: [
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_PRODUCTS_CREATE,
      PERMISSIONS.INVENTORY_PRODUCTS_EDIT,
      PERMISSIONS.INVENTORY_PRODUCTS_DELETE,
      PERMISSIONS.INVENTORY_CATEGORIES_MANAGE,
      PERMISSIONS.INVENTORY_STOCK_COUNT,
      PERMISSIONS.INVENTORY_STOCK_ADJUST,
      PERMISSIONS.INVENTORY_DAILY_REOPEN,
      PERMISSIONS.INVENTORY_REPORTS_VIEW,
      PERMISSIONS.INVENTORY_USERS_MANAGE,
    ],
  },
  {
    module: "profile",
    label: "Perfil propio",
    keys: [PERMISSIONS.PROFILE_EDIT],
  },
];

// Etiquetas legibles para cada clave de permiso
export const PERMISSION_LABELS: Record<string, string> = {
  "users:view":               "Ver usuarios",
  "users:create":             "Crear usuarios",
  "users:edit":               "Editar usuarios",
  "users:deactivate":         "Desactivar usuarios",
  "users:assign_role":        "Asignar roles",
  "users:manage_permissions": "Gestionar permisos individuales",
  "employees:view":           "Ver empleados",
  "employees:create":         "Crear empleados",
  "employees:edit":           "Editar empleados",
  "employees:deactivate":     "Activar/desactivar empleados",
  "employees:delete":         "Eliminar empleados",
  "employees:credentials":    "Gestionar credenciales de empleados",
  "roles:view":               "Ver roles",
  "roles:create":             "Crear roles",
  "roles:edit":               "Editar roles",
  "roles:deactivate":         "Activar/desactivar roles",
  "time_entries:view":        "Ver registros de horas",
  "time_entries:create":      "Registrar horas",
  "time_entries:edit":        "Editar registros de horas",
  "time_entries:delete":      "Eliminar registros de horas",
  "schedules:view":           "Ver horarios",
  "schedules:create":         "Crear horarios",
  "schedules:edit":           "Editar horarios",
  "schedules:delete":         "Eliminar horarios",
  "schedules:publish":        "Publicar/despublicar horarios",
  "tips:view":                "Ver propinas",
  "tips:create":              "Registrar propinas",
  "tips:edit":                "Editar propinas",
  "tips:delete":              "Eliminar propinas",
  "payroll:view":             "Ver nómina",
  "payroll:generate":         "Generar nómina",
  "payroll:export_pdf":       "Exportar PDF de nómina",
  "payroll:export_excel":     "Exportar Excel de nómina",
  "pay_adjustments:view":     "Ver ajustes de pago",
  "pay_adjustments:create":   "Crear ajustes de pago",
  "pay_adjustments:edit":     "Editar ajustes de pago",
  "pay_adjustments:delete":   "Eliminar ajustes de pago",
  "bonuses:view":             "Ver bonos",
  "bonuses:create":           "Crear bonos",
  "bonuses:edit":             "Editar bonos",
  "bonuses:delete":           "Eliminar bonos",
  "bonuses:assign":           "Asignar bonos a empleados",
  "discounts:view":           "Ver descuentos",
  "discounts:create":         "Crear descuentos",
  "discounts:edit":           "Editar descuentos",
  "discounts:delete":         "Eliminar descuentos",
  "discounts:assign":         "Asignar descuentos a empleados",
  "settings:view":            "Ver configuración",
  "settings:edit":            "Editar configuración",
  "audit:view":               "Ver auditoría",
  "inventory:view":              "Acceder al inventario",
  "inventory:products:create":   "Crear productos",
  "inventory:products:edit":     "Editar productos",
  "inventory:products:delete":   "Eliminar/desactivar productos",
  "inventory:categories:manage": "Gestionar categorías",
  "inventory:stock:count":       "Registrar movimientos / inventario diario",
  "inventory:stock:adjust":      "Ajustar stock manualmente",
  "inventory:daily:reopen":      "Reabrir inventario diario",
  "inventory:reports:view":      "Ver reportes de inventario",
  "inventory:users:manage":      "Gestionar usuarios del inventario",
  "profile:edit":             "Editar perfil propio",
};
