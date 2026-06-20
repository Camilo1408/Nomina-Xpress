import { prisma } from "@/lib/db";
import type { AuditAction, AuditModule, AuditResult } from "@/lib/audit-labels";

/**
 * Auditoría — historial inmutable de acciones del sistema.
 *
 * `recordAudit` NUNCA lanza: si el log falla, la operación de negocio que lo
 * originó no debe romperse. Solo registra el error en consola. Esto cumple la
 * regla "la auditoría debe mantenerse consistente incluso si ocurre un error".
 *
 * Las constantes/etiquetas (acciones, módulos) viven en `@/lib/audit-labels`
 * para poder reutilizarlas en componentes cliente sin arrastrar Prisma.
 */

export type { AuditAction, AuditModule, AuditResult } from "@/lib/audit-labels";
export {
  AUDIT_ACTIONS,
  AUDIT_MODULES,
  ACTION_LABELS,
  MODULE_LABELS,
} from "@/lib/audit-labels";

interface RecordAuditParams {
  tenantId: string;
  userId?: string | null;
  username: string;
  role: string;
  action: AuditAction;
  module: AuditModule;
  entityId?: string | null;
  entityLabel?: string | null;
  description: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  result?: AuditResult;
}

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (isPlainObject(value) && Object.keys(value).length === 0) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Recorta `before`/`after` para que SOLO conserven los campos que cambiaron,
 * en lugar de serializar el objeto completo. Reduce el peso de cada fila y deja
 * el registro más claro (se ve de un vistazo qué se modificó). Si alguno no es
 * un objeto (ej. CREATE solo trae `after`, DELETE solo `before`), se deja igual.
 */
export function diffChanges(before: unknown, after: unknown): { before: unknown; after: unknown } {
  if (!isPlainObject(before) || !isPlainObject(after)) {
    return { before, after };
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
}

// El user-agent es el campo más pesado y repetitivo (~150 B). En eventos de
// autenticación (alto volumen) se omite; en el resto se trunca a un tope.
const AUTH_NOISE_ACTIONS = new Set<AuditAction>(["LOGIN", "LOGOUT", "LOGIN_FAILED"]);
const USER_AGENT_MAX = 160;

export function compactUserAgent(ua: string | null | undefined, action: AuditAction): string | null {
  if (!ua) return null;
  if (AUTH_NOISE_ACTIONS.has(action)) return null;
  return ua.length > USER_AGENT_MAX ? ua.slice(0, USER_AGENT_MAX) : ua;
}

/** Escribe un evento de auditoría. No lanza nunca. */
export async function recordAudit(params: RecordAuditParams): Promise<void> {
  try {
    // Solo cuando hay AMBOS estados (edición) recortamos a los campos cambiados.
    let beforeVal = params.before;
    let afterVal = params.after;
    if (beforeVal != null && afterVal != null) {
      const diff = diffChanges(beforeVal, afterVal);
      beforeVal = diff.before;
      afterVal = diff.after;
    }

    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        username: params.username,
        role: params.role,
        action: params.action,
        module: params.module,
        entityId: params.entityId ?? null,
        entityLabel: params.entityLabel ?? null,
        description: params.description,
        before: serialize(beforeVal),
        after: serialize(afterVal),
        ip: params.ip ?? null,
        userAgent: compactUserAgent(params.userAgent, params.action),
        result: params.result ?? "SUCCESS",
      },
    });
  } catch (err) {
    console.error("[audit] no se pudo registrar el evento:", err);
  }
}

/** Extrae IP y user-agent de los headers de la petición. */
export function getClientInfo(req: Request): { ip: string | null; userAgent: string | null } {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0]?.trim() : null) || h.get("x-real-ip") || null;
  const userAgent = h.get("user-agent");
  return { ip, userAgent: userAgent ?? null };
}

type SessionLike = {
  user: {
    id?: string;
    name?: string | null;
    role: string;
    tenantId: string;
  };
};

type AuditEntry = {
  action: AuditAction;
  module: AuditModule;
  entityId?: string | null;
  entityLabel?: string | null;
  description: string;
  before?: unknown;
  after?: unknown;
  result?: AuditResult;
};

/**
 * Helper ergonómico para rutas API: rellena tenantId/usuario/rol desde la
 * sesión e IP/user-agent desde la petición. Reduce cada registro a una línea.
 */
export async function logAudit(
  req: Request,
  session: SessionLike,
  entry: AuditEntry
): Promise<void> {
  const { ip, userAgent } = getClientInfo(req);
  await recordAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id ?? null,
    username: session.user.name ?? "—",
    role: session.user.role,
    ip,
    userAgent,
    ...entry,
  });
}
