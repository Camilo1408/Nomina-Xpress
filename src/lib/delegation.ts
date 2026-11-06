import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolvePermissionsSync } from "@/lib/get-permissions";
import { isDailyCategoryKey, PERMISSION_LABELS } from "@/lib/permission-keys";

/**
 * Techo de delegación (RN-20, hallazgo H5 del Plan de Calidad).
 *
 * Nadie otorga permisos que no tiene y nadie gestiona a un usuario que tiene
 * permisos que él no tiene. Solo el PROPRIETARY otorga cualquier clave. Aplica a:
 * asignar rol base o rol personalizado, permisos individuales, crear o editar roles
 * personalizados y restablecer contraseñas de otros.
 *
 * Excepción a propósito: un ADMIN o SUPERADMIN que opera con su ROL BASE puede
 * delegar las categorías del inventario diario (`inventory:daily:<slug>:*`),
 * porque por su rol ya opera todas (ver resolveInventoryPermissions en auth.ts),
 * aunque esas claves no estén en su set de permisos.
 */

const PRIVILEGED_BASE_ROLES = ["SUPERADMIN", "ADMIN"];

type CustomRoleLike = { permissions: string; active: boolean; tenantId: string } | null | undefined;
type OverrideLike = { permissionKey: string; granted: boolean };

export type PermissionHolder = {
  role: string;
  active?: boolean;
  customRole?: CustomRoleLike;
  userPermissions?: OverrideLike[];
};

export type DelegationContext = {
  actorId: string | null;
  isOwner: boolean;
  grantable: Set<string>;
  /** Puede delegar cualquier categoría del inventario diario (rol base privilegiado). */
  anyDailyCategory: boolean;
};

const hasActiveCustomRole = (u: PermissionHolder, tenantId: string) =>
  !!(u.customRole && u.customRole.active && u.customRole.tenantId === tenantId);

/** Permisos efectivos (sin base de datos). El PROPRIETARY tiene todas las claves. */
export function permissionsOf(user: PermissionHolder, tenantId: string): Set<string> {
  return resolvePermissionsSync(user, tenantId);
}

export function buildDelegationContext(
  actor: (PermissionHolder & { id: string }) | null,
  tenantId: string,
): DelegationContext {
  if (!actor || actor.active === false) {
    return { actorId: actor?.id ?? null, isOwner: false, grantable: new Set(), anyDailyCategory: false };
  }
  if (actor.role === "PROPRIETARY") {
    return { actorId: actor.id, isOwner: true, grantable: new Set(), anyDailyCategory: true };
  }
  return {
    actorId: actor.id,
    isOwner: false,
    grantable: permissionsOf(actor, tenantId),
    anyDailyCategory: PRIVILEGED_BASE_ROLES.includes(actor.role) && !hasActiveCustomRole(actor, tenantId),
  };
}

/** Claves de `keys` que el actor NO puede otorgar (vacío = todo permitido). */
export function ungrantable(ctx: DelegationContext, keys: Iterable<string>): string[] {
  if (ctx.isOwner) return [];
  const out: string[] = [];
  for (const k of keys) {
    if (ctx.grantable.has(k)) continue;
    if (ctx.anyDailyCategory && isDailyCategoryKey(k)) continue;
    out.push(k);
  }
  return out;
}

/** Carga al actor de la sesión con su rol personalizado y overrides. */
export async function loadDelegationContext(session: {
  user: { id?: string; tenantId: string; role: string };
}): Promise<DelegationContext> {
  const { id, tenantId, role } = session.user;
  if (!id) return buildDelegationContext(null, tenantId);
  if (role === "PROPRIETARY") return buildDelegationContext({ id, role }, tenantId);
  const actor = await prisma.user.findFirst({
    where: { id, tenantId },
    include: {
      customRole: { select: { permissions: true, active: true, tenantId: true } },
      userPermissions: { select: { permissionKey: true, granted: true } },
    },
  });
  return buildDelegationContext(actor, tenantId);
}

/** `include` para cargar a un usuario objetivo con lo que necesita `permissionsOf`. */
export const PERMISSION_HOLDER_INCLUDE = {
  customRole: { select: { permissions: true, active: true, tenantId: true } },
  userPermissions: { select: { permissionKey: true, granted: true } },
} as const;

function label(keys: string[]): string {
  const shown = keys.slice(0, 5).map((k) => PERMISSION_LABELS[k] ?? k);
  return shown.join(", ") + (keys.length > 5 ? ` y ${keys.length - 5} más` : "");
}

/** 403 por gestionar a alguien con más permisos que el actor. */
export function targetAboveResponse(keys: string[]) {
  return NextResponse.json(
    { error: `No puedes gestionar a un usuario con permisos que tú no tienes (${label(keys)})` },
    { status: 403 },
  );
}

/** 403 por intentar otorgar permisos que el actor no tiene. */
export function grantAboveResponse(keys: string[]) {
  return NextResponse.json(
    { error: `No puedes otorgar permisos que tú no tienes (${label(keys)})` },
    { status: 403 },
  );
}

/** 403 por intentar cambiarse a sí mismo el rol, el estado o los permisos (CP-47). */
export function selfChangeResponse() {
  return NextResponse.json(
    { error: "No puedes cambiar tu propio rol, estado ni permisos" },
    { status: 403 },
  );
}

/**
 * Comprueba un cambio sobre un usuario existente: el objetivo actual y el
 * resultado deben quedar dentro del techo del actor. Devuelve la respuesta 403 o null.
 */
export function checkTargetChange(
  ctx: DelegationContext,
  before: PermissionHolder,
  after: PermissionHolder,
  tenantId: string,
) {
  if (ctx.isOwner) return null;
  const above = ungrantable(ctx, permissionsOf(before, tenantId));
  if (above.length) return targetAboveResponse(above);
  const granted = ungrantable(ctx, permissionsOf(after, tenantId));
  if (granted.length) return grantAboveResponse(granted);
  return null;
}
