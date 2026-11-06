// Estado vigente de una sesión (RN-19), compartido por el callback jwt() de
// auth.ts y por el endpoint que consulta Inventory Xpress (I-H1b).
//
// Inventory lee la misma cookie de sesión, pero no tiene acceso a esta base de
// datos: sin preguntar aquí, una sesión revocada en Nómina (usuario desactivado,
// contraseña o rol cambiados) seguía abriendo el inventario hasta 12 h, y los
// permisos de inventario quedaban congelados mientras el usuario no volviera a
// Nómina. POST /api/inventory-permissions/session resuelve las dos cosas.

import { prisma } from "@/lib/db";
import { isTokenStillValid } from "@/lib/session-guard";
import { resolveInventoryPermissions } from "@/lib/inventory-permissions";

export type SessionState =
  | { valid: false }
  | { valid: true; role: string; inventoryAccess: boolean; inventoryPermissions: string[] };

/**
 * Sal de cifrado del token que Inventory envía a /api/inventory-permissions/session.
 * Es distinta del nombre de la cookie de sesión (la sal de la cookie), así que una
 * cookie robada del navegador no sirve como credencial de este endpoint: solo quien
 * tiene NEXTAUTH_SECRET puede cifrar la consulta. DEBE ser idéntica en Inventory.
 */
export const SESSION_CHECK_SALT = "nx.inventory-session-check";

/** Vida máxima del token de consulta: limita la repetición de una consulta capturada. */
export const SESSION_CHECK_MAX_AGE_SECONDS = 120;

export async function resolveSessionState(
  userId: string,
  tenantId: string,
  tokenVersion: unknown,
): Promise<SessionState> {
  const dbUser = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { role: true, inventoryAccess: true, active: true, sessionVersion: true },
  });
  // Usuario eliminado, desactivado o con la sesión revocada ⇒ inválida.
  if (!dbUser || !isTokenStillValid(tokenVersion, dbUser)) return { valid: false };

  const inventoryPermissions = await resolveInventoryPermissions(
    userId,
    tenantId,
    dbUser.role,
    dbUser.inventoryAccess,
  );
  return {
    valid: true,
    role: dbUser.role,
    inventoryAccess: inventoryPermissions.length > 0,
    inventoryPermissions,
  };
}
