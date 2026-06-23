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
 * Sincroniza el espejo desde el inventario (GET /api/categories).
 * - Reenvía la cookie de sesión del usuario (las apps comparten el JWT).
 * - Hace upsert de las categorías raíz activas y marca como inactivas las que
 *   ya no existen (eliminadas/desactivadas) → así desaparecen de la matriz.
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

  let remote: InventoryApiCategory[];
  try {
    const res = await fetch(`${INVENTORY_URL}/api/categories`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return getMirroredCategories(tenantId);
    const data = (await res.json()) as { categories?: InventoryApiCategory[] };
    // El inventario ya devuelve solo categorías raíz activas con slug.
    remote = (data.categories ?? []).filter((c) => !c.parentId && !!c.slug);
  } catch {
    // Inventario caído o inalcanzable → conservar el espejo actual
    return getMirroredCategories(tenantId);
  }

  const remoteSlugs = new Set(remote.map((c) => c.slug as string));

  // Upsert de las categorías remotas (reactiva las que vuelvan a existir)
  for (const cat of remote) {
    await prisma.inventoryCategory.upsert({
      where: { tenantId_slug: { tenantId, slug: cat.slug as string } },
      create: { tenantId, slug: cat.slug as string, name: cat.name, active: true },
      update: { name: cat.name, active: true, syncedAt: new Date() },
    });
  }

  // Marcar como inactivas las que ya no llegaron (eliminadas en el inventario)
  await prisma.inventoryCategory.updateMany({
    where: { tenantId, active: true, slug: { notIn: [...remoteSlugs] } },
    data: { active: false },
  });

  return getMirroredCategories(tenantId);
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
