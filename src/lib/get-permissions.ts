// Resolución de permisos efectivos de un usuario — solo server-side (usa Prisma).
// El resultado final combina: rol base → rol personalizado → overrides individuales.

import { prisma } from "@/lib/db";
import { PERMISSIONS, BASE_ROLE_PERMISSIONS, ALL_PERMISSION_KEYS, isValidPermissionKey, type PermissionKey } from "@/lib/permission-keys";

/**
 * Retorna el set de permisos efectivos del usuario indicado.
 *
 * Orden de resolución:
 *  1. Si el usuario es PROPRIETARY → todos los permisos (bypass total).
 *  2. Si el usuario tiene un CustomRole activo → usa las permissions de ese rol.
 *  3. Si no tiene CustomRole → usa los permisos del rol base (BASE_ROLE_PERMISSIONS).
 *  4. Se aplican los overrides individuales (UserPermission): granted=true agrega,
 *     granted=false elimina.
 */
export async function getEffectivePermissions(
  userId: string,
  tenantId: string
): Promise<Set<string>> {
  if (!userId) return new Set();

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: {
      customRole: { select: { permissions: true, active: true, tenantId: true } },
      userPermissions: { select: { permissionKey: true, granted: true } },
    },
  });

  if (!user) return new Set();

  // PROPRIETARY: acceso total a permisos estáticos. Las claves dinámicas de
  // inventario diario por categoría se agregan al construir el JWT (auth.ts),
  // porque dependen de las categorías activas.
  if (user.role === "PROPRIETARY") {
    return new Set<string>(ALL_PERMISSION_KEYS);
  }

  // Permisos base: del CustomRole activo o del rol del sistema
  let base: Set<string>;

  if (user.customRole && user.customRole.active && user.customRole.tenantId === tenantId) {
    const parsed = JSON.parse(user.customRole.permissions) as string[];
    // Conserva claves estáticas válidas Y claves dinámicas inventory:daily:<slug>:<acción>
    base = new Set(parsed.filter((k) => isValidPermissionKey(k)));
  } else {
    base = new Set<string>(BASE_ROLE_PERMISSIONS[user.role] ?? []);
  }

  // Aplicar overrides individuales
  for (const override of user.userPermissions) {
    if (override.granted) {
      base.add(override.permissionKey);
    } else {
      base.delete(override.permissionKey);
    }
  }

  return base;
}

/**
 * Verifica si el usuario tiene un permiso específico.
 * Shortcut de getEffectivePermissions() para una sola clave.
 */
export async function hasPermission(
  userId: string,
  tenantId: string,
  key: PermissionKey
): Promise<boolean> {
  const perms = await getEffectivePermissions(userId, tenantId);
  return perms.has(key);
}

/**
 * Versión síncrona para cuando ya se tiene el usuario con datos incluidos.
 * No hace queries adicionales. Útil en middleware de API donde ya se consultó
 * el usuario.
 */
export function resolvePermissionsSync(user: {
  role: string;
  customRole?: { permissions: string; active: boolean; tenantId: string } | null;
  userPermissions?: { permissionKey: string; granted: boolean }[];
}, tenantId: string): Set<string> {
  if (user.role === "PROPRIETARY") return new Set<string>(ALL_PERMISSION_KEYS);

  let base: Set<string>;

  if (user.customRole && user.customRole.active && user.customRole.tenantId === tenantId) {
    const parsed = JSON.parse(user.customRole.permissions) as string[];
    base = new Set(parsed.filter((k) => isValidPermissionKey(k)));
  } else {
    base = new Set<string>(BASE_ROLE_PERMISSIONS[user.role] ?? []);
  }

  for (const override of user.userPermissions ?? []) {
    if (override.granted) base.add(override.permissionKey);
    else base.delete(override.permissionKey);
  }

  return base;
}

/**
 * ¿El usuario puede acceder al ÁREA de administración?
 *
 * El acceso al área admin depende de los permisos EFECTIVOS, no del rol base:
 * un EMPLOYEE con un rol personalizado o permisos individuales que otorgan
 * acciones admin (horas, horarios, propinas, nómina, etc.) debe poder entrar,
 * y el sidebar/páginas ya filtran por permiso lo que ve.
 *
 * Regla: tiene acceso si posee al menos un permiso que NO sea puramente del
 * portal (`profile:edit`) NI del módulo externo de inventario (`inventory:*`,
 * incluidas las claves dinámicas por categoría `inventory:daily:*`). El baseline
 * de EMPLOYEE es vacío, así que un empleado sin permisos concedidos queda fuera
 * del área admin (solo su portal).
 *
 * El inventario es un módulo externo ortogonal al área de gestión: un EMPLOYEE
 * cuyos únicos permisos elevados son de inventario debe PERMANECER en su portal
 * (Mi Quincena / Mi Horario / Perfil) y abrir el inventario desde ahí — no ser
 * enviado al área admin, donde no tendría acceso a su propia nómina. Si además de
 * inventario tiene algún permiso admin real (horas, horarios, nómina, etc.), sí
 * entra al área admin.
 */
export function hasAdminAreaAccess(permissions: Set<string>): boolean {
  for (const key of permissions) {
    if (key === PERMISSIONS.PROFILE_EDIT) continue;
    if (key.startsWith("inventory:")) continue;
    return true;
  }
  return false;
}

/**
 * Helper para Server Components y API routes: dado un session de NextAuth,
 * retorna el set de permisos efectivos del usuario logueado.
 */
export async function getSessionPermissions(session: {
  user?: { id?: string | null; tenantId?: string | null };
} | null): Promise<Set<string>> {
  const id = session?.user?.id;
  const tenantId = session?.user?.tenantId;
  if (!id || !tenantId) return new Set();
  return getEffectivePermissions(id, tenantId);
}

/**
 * Verifica si el usuario de la sesión tiene un permiso. Úsese en API routes
 * para autorización fina (en lugar de comparar roles literales).
 */
export async function sessionCan(
  session: { user?: { id?: string | null; tenantId?: string | null } } | null,
  key: PermissionKey
): Promise<boolean> {
  const perms = await getSessionPermissions(session);
  return perms.has(key);
}

// Re-exportar las constantes para conveniencia
export { PERMISSIONS };
