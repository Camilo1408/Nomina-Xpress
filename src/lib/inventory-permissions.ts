import { prisma } from "@/lib/db";
import { getEffectivePermissions } from "@/lib/get-permissions";
import { PERMISSIONS, dailyCategoryKeys } from "@/lib/permission-keys";
import { getMirroredCategories } from "@/lib/inventory-sync";

const PRIVILEGED_ROLES = ["PROPRIETARY", "SUPERADMIN", "ADMIN"];

/**
 * Calcula los permisos de inventario efectivos del usuario para transmitirlos
 * en el JWT (el app de inventario los lee y hace enforcing granular).
 *
 * - Roles PROPRIETARY/SUPERADMIN/ADMIN traen todos los permisos estáticos de
 *   inventario por su rol base; un CustomRole puede acotarlos.
 * - Empleados con el toggle `inventoryAccess` reciben el baseline operativo.
 * - Permisos DINÁMICOS por categoría (inventory:daily:<slug>:*):
 *   · roles privilegiados con rol base → TODAS las categorías activas (espejo local)
 *   · cualquier rol/usuario → las claves por categoría que tenga asignadas
 */
export async function resolveInventoryPermissions(
  userId: string,
  tenantId: string,
  role: string,
  inventoryAccessFlag: boolean
): Promise<string[]> {
  const effective = await getEffectivePermissions(userId, tenantId);
  const inv = new Set<string>([...effective].filter((k) => k.startsWith("inventory:")));
  if (inventoryAccessFlag) {
    inv.add(PERMISSIONS.INVENTORY_VIEW);
    inv.add(PERMISSIONS.INVENTORY_STOCK_COUNT);
  }

  // ¿El usuario opera con su rol base (sin CustomRole activo)?
  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: { customRole: { select: { active: true, tenantId: true } } },
  });
  const hasActiveCustomRole = !!(u?.customRole && u.customRole.active && u.customRole.tenantId === tenantId);
  const usesBaseRole = role === "PROPRIETARY" || !hasActiveCustomRole;

  // Roles privilegiados con rol base → acceso completo a TODAS las categorías activas.
  if (PRIVILEGED_ROLES.includes(role) && usesBaseRole) {
    const categories = await getMirroredCategories(tenantId);
    for (const cat of categories) {
      for (const key of dailyCategoryKeys(cat.slug)) inv.add(key);
    }
  }

  return [...inv];
}
