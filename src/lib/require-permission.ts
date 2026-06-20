import "server-only";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEffectivePermissions } from "@/lib/get-permissions";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * Guardia de página para Server Components. Verifica que el usuario logueado
 * tenga el permiso indicado; si no, redirige al dashboard. Retorna la sesión y
 * el set de permisos efectivos para reutilizar en la página sin re-consultar.
 *
 * Uso:
 *   const { session, permissions } = await requirePagePermission(PERMISSIONS.EMPLOYEES_VIEW);
 */
export async function requirePagePermission(key: PermissionKey) {
  const session = await auth();
  if (!session?.user?.id || !session.user.tenantId) redirect("/login");

  const permissions = await getEffectivePermissions(session.user.id, session.user.tenantId);
  if (!permissions.has(key)) {
    redirect("/admin/dashboard");
  }

  return { session, permissions };
}
