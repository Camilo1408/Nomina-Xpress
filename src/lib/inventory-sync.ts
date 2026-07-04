// Sincronización del espejo local de categorías de inventario.
// El inventario es el dueño de las categorías (otra BD). Nómina mantiene un
// espejo (InventoryCategory) para: (a) renderizar la matriz de permisos por
// categoría, y (b) emitir las claves inventory:daily:<slug>:* en el JWT al login
// (cuando no puede llamar al inventario por HTTP).
//
// Solo server-side (usa Prisma y fetch al inventario).

import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

const INVENTORY_URL = process.env.NEXT_PUBLIC_INVENTARIO_APP_URL;

export interface InventoryCategoryDTO {
  slug: string;
  name: string;
}

interface InventoryApiCategory {
  id: string;
  name: string;
  slug: string | null;
  parentId?: string | null;
}

// Respuesta del endpoint dedicado de permisos del inventario.
// Contrato: GET <INVENTORY_URL>/api/inventory-permissions
//   { global: string[], categories: [{slug,name,keys}], defaultGrantRoles: string[] }
interface InventoryPermissionsResponse {
  global?: string[];
  categories?: Array<{ slug: string; name: string; keys?: string[] }>;
  defaultGrantRoles?: string[];
}

/**
 * Lee el espejo local de categorías activas del tenant (sin llamar al inventario).
 * Esta es la fuente que usa el builder del JWT en cada login.
 */
export async function getMirroredCategories(tenantId: string): Promise<InventoryCategoryDTO[]> {
  const rows = await prisma.inventoryCategory.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
    select: { slug: true, name: true },
  });
  return rows;
}

/**
 * Reconciliación del espejo: hace upsert de las categorías raíz recibidas y marca
 * como inactivas las que ya no llegaron (eliminadas en el inventario), de forma
 * que desaparezcan de la matriz de permisos.
 */
async function reconcileCategories(
  tenantId: string,
  remote: InventoryCategoryDTO[]
): Promise<InventoryCategoryDTO[]> {
  const remoteSlugs = new Set(remote.map((c) => c.slug));

  for (const cat of remote) {
    await prisma.inventoryCategory.upsert({
      where: { tenantId_slug: { tenantId, slug: cat.slug } },
      create: { tenantId, slug: cat.slug, name: cat.name, active: true },
      update: { name: cat.name, active: true, syncedAt: new Date() },
    });
  }

  await prisma.inventoryCategory.updateMany({
    where: { tenantId, active: true, slug: { notIn: [...remoteSlugs] } },
    data: { active: false },
  });

  return getMirroredCategories(tenantId);
}

/**
 * Trae las categorías raíz desde el inventario. Intenta primero el endpoint
 * dedicado de permisos (`/api/inventory-permissions`, contrato recomendado) y, si
 * no está disponible, recurre al legacy `/api/categories`. Reenvía la cookie de
 * sesión (las apps comparten el JWT). Devuelve `null` si ninguno respondió, para
 * que el caller conserve el espejo actual.
 */
async function fetchRemoteCategories(cookieHeader: string): Promise<InventoryCategoryDTO[] | null> {
  // 1. Endpoint dedicado de permisos (recomendado)
  try {
    const res = await fetch(`${INVENTORY_URL}/api/inventory-permissions`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as InventoryPermissionsResponse;
      if (Array.isArray(data.categories)) {
        return data.categories
          .filter((c) => !!c.slug)
          .map((c) => ({ slug: c.slug, name: c.name }));
      }
    }
  } catch {
    // cae al fallback
  }

  // 2. Fallback legacy: /api/categories
  try {
    const res = await fetch(`${INVENTORY_URL}/api/categories`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { categories?: InventoryApiCategory[] };
    return (data.categories ?? [])
      .filter((c) => !c.parentId && !!c.slug)
      .map((c) => ({ slug: c.slug as string, name: c.name }));
  } catch {
    return null;
  }
}

/**
 * Sincroniza el espejo desde el inventario (pull).
 * - Usa el endpoint dedicado `/api/inventory-permissions` con fallback a
 *   `/api/categories`. Reenvía la cookie de sesión del usuario.
 * - Hace upsert de las categorías raíz activas y marca como inactivas las que
 *   ya no existen → así desaparecen de la matriz.
 * - Si el inventario no responde, NO lanza: devuelve el espejo actual (tolerante
 *   a caídas temporales del inventario).
 *
 * Devuelve la lista de categorías activas resultante.
 */
export async function syncInventoryCategories(
  tenantId: string,
  cookieHeader: string
): Promise<InventoryCategoryDTO[]> {
  if (!INVENTORY_URL) return getMirroredCategories(tenantId);

  const remote = await fetchRemoteCategories(cookieHeader);
  if (remote === null) return getMirroredCategories(tenantId); // inventario caído

  return reconcileCategories(tenantId, remote);
}

/**
 * Upsert puntual de UNA categoría raíz desde el webhook push del inventario
 * (`inventory.category.created`). No desactiva otras categorías (es un alta
 * incremental, no una reconciliación completa). Idempotente: si la categoría ya
 * existía, solo refresca el nombre y la reactiva.
 *
 * Los roles privilegiados (PROPRIETARY/SUPERADMIN/ADMIN con rol base) obtienen
 * acceso a la nueva categoría automáticamente al re-loguear, porque el JWT
 * (`resolveInventoryPermissions`) deriva sus claves de las categorías activas del
 * espejo — no hay que persistir asignación por rol.
 */
export async function upsertCategoryFromPush(
  tenantId: string,
  category: InventoryCategoryDTO
): Promise<void> {
  await prisma.inventoryCategory.upsert({
    where: { tenantId_slug: { tenantId, slug: category.slug } },
    create: { tenantId, slug: category.slug, name: category.name, active: true },
    update: { name: category.name, active: true, syncedAt: new Date() },
  });
}

/**
 * Helper para Server Components que renderizan la matriz de permisos: sincroniza
 * el espejo (reenviando la cookie de sesión actual) y devuelve las categorías
 * activas. Si algo falla, devuelve el espejo local sin romper la página.
 */
export async function getDailyCategoriesForUI(tenantId: string): Promise<InventoryCategoryDTO[]> {
  try {
    const cookieHeader = (await cookies()).toString();
    return await syncInventoryCategories(tenantId, cookieHeader);
  } catch {
    return getMirroredCategories(tenantId);
  }
}
