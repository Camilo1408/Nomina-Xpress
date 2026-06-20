// Política de retención de AuditLog — solo server-side (usa Prisma).
// Un purgado periódico acota el crecimiento permanente del historial a un techo
// estable: cada corrida elimina los registros más antiguos que la ventana de
// retención. Sin esto, AuditLog crece para siempre.

import { prisma } from "@/lib/db";

export const DEFAULT_AUDIT_RETENTION_MONTHS = 6;

/** Meses de retención configurados (env AUDIT_RETENTION_MONTHS) o el valor por defecto. */
export function getRetentionMonths(): number {
  const n = Number(process.env.AUDIT_RETENTION_MONTHS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_AUDIT_RETENTION_MONTHS;
}

/**
 * Elimina los registros de auditoría más antiguos que la ventana de retención.
 * Devuelve cuántos se borraron y la fecha de corte usada.
 */
export async function purgeOldAuditLogs(
  months: number = getRetentionMonths()
): Promise<{ deleted: number; cutoff: string; months: number }> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const res = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { deleted: res.count, cutoff: cutoff.toISOString(), months };
}
