import { prisma } from "@/lib/db";
import { AuditClient } from "@/components/admin/audit/AuditClient";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";
import type { Prisma } from "@/generated/prisma";

const PAGE_SIZE = 25;

interface SearchParams {
  page?: string;
  user?: string;
  action?: string;
  module?: string;
  result?: string;
  from?: string;
  to?: string;
  q?: string;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Guardia de seguridad por permiso (defensa en profundidad).
  const { session } = await requirePagePermission(PERMISSIONS.AUDIT_VIEW);
  const tenantId = session.user.tenantId;
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page) || 1);

  // Construcción del filtro (where) a partir de los searchParams
  const where: Prisma.AuditLogWhereInput = { tenantId };
  if (sp.user) where.username = sp.user;
  if (sp.action) where.action = sp.action;
  if (sp.module) where.module = sp.module;
  if (sp.result) where.result = sp.result;

  if (sp.from || sp.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (sp.from) createdAt.gte = new Date(`${sp.from}T00:00:00`);
    if (sp.to) createdAt.lte = new Date(`${sp.to}T23:59:59.999`);
    where.createdAt = createdAt;
  }

  if (sp.q) {
    // SQLite LIKE es case-insensitive para ASCII por defecto.
    where.OR = [
      { description: { contains: sp.q } },
      { entityLabel: { contains: sp.q } },
      { username: { contains: sp.q } },
    ];
  }

  const [total, logs, portalUsers] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    // Todos los usuarios con acceso al portal del tenant (actualización dinámica)
    prisma.user.findMany({
      where: { tenantId },
      select: { username: true, role: true, employee: { select: { name: true } } },
      orderBy: { username: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Solo usuarios activos del portal — actualización automática
  const users = portalUsers.map((u) => ({
    username: u.username,
    label: u.employee?.name ? `${u.employee.name} (@${u.username})` : `@${u.username}`,
  }));

  return (
    <AuditClient
      logs={logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      }))}
      users={users}
      total={total}
      page={page}
      totalPages={totalPages}
      pageSize={PAGE_SIZE}
      filters={{
        user: sp.user ?? "",
        action: sp.action ?? "",
        module: sp.module ?? "",
        result: sp.result ?? "",
        from: sp.from ?? "",
        to: sp.to ?? "",
        q: sp.q ?? "",
      }}
    />
  );
}
