import { prisma } from "@/lib/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { UserActions } from "@/components/admin/usuarios/UserActions";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Personal",
  ADMIN: "Admin",
  SUPERADMIN: "Superadmin",
  PROPRIETARY: "Propietario",
};

const ROLE_COLORS: Record<string, string> = {
  EMPLOYEE: "bg-[#8B6355]/15 text-[#8B6355]",
  ADMIN: "bg-[#6B8E6B]/15 text-[#6B8E6B]",
  SUPERADMIN: "bg-[#C1643F]/15 text-[#C1643F]",
  PROPRIETARY: "bg-[#2C1F15]/10 text-[#2C1F15]",
};

export default async function UsuariosPage() {
  const { session, permissions } = await requirePagePermission(PERMISSIONS.USERS_VIEW);
  const canCreate = permissions.has(PERMISSIONS.USERS_CREATE);
  const canManagePermissions = permissions.has(PERMISSIONS.USERS_MANAGE_PERMISSIONS);
  const canDeactivate = permissions.has(PERMISSIONS.USERS_DEACTIVATE);

  const users = await prisma.user.findMany({
    where: { tenantId: session.user.tenantId },
    include: {
      employee: { select: { name: true, active: true } },
      customRole: { select: { name: true, active: true } },
      _count: { select: { userPermissions: true } },
    },
    orderBy: [{ role: "asc" }, { username: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Usuarios del portal</h1>
          <p className="text-sm text-[#7A6358] mt-1">
            {users.length} usuario{users.length !== 1 ? "s" : ""} registrados.
          </p>
        </div>
        {canCreate && (
          <Link href="/admin/usuarios/new">
            <Button className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-2">
              <Plus className="w-4 h-4" /> Nuevo usuario admin
            </Button>
          </Link>
        )}
      </div>

      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-[#E0D5CA] bg-[#C1643F]/8">
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Usuario</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Rol base</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Rol personalizado</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Personal / Pagable</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Overrides</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Acceso</th>
              <th className="text-right px-4 py-3 font-semibold text-[#2C1F15]">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr
                key={u.id}
                className={`border-b border-[#F2EDE6] last:border-0 ${i % 2 === 1 ? "bg-[#F2EDE6]/50" : ""}`}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-[#2C1F15]">@{u.username}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge className={`border-0 ${ROLE_COLORS[u.role] ?? "bg-[#E0D5CA] text-[#7A6358]"}`}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {u.customRole ? (
                    <span className="text-sm text-[#2C1F15]">
                      {u.customRole.name}
                      {!u.customRole.active && (
                        <span className="ml-1 text-xs text-[#B94040]">(inactivo)</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[#7A6358] text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.employee ? (
                    <div>
                      <p className="text-[#2C1F15]">{u.employee.name}</p>
                      {!u.employee.active && (
                        <span className="text-xs text-[#B94040]">Personal inactivo</span>
                      )}
                    </div>
                  ) : (
                    <Badge className="bg-[#8B6355]/10 text-[#8B6355] border-0 text-xs">
                      Solo sistema
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-[#7A6358]">
                  {u._count.userPermissions > 0 ? (
                    <span className="text-[#C1643F] font-medium">{u._count.userPermissions}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    className={
                      u.active
                        ? "bg-[#6B8E6B]/15 text-[#6B8E6B] border-0"
                        : "bg-[#B94040]/10 text-[#B94040] border-0"
                    }
                  >
                    {u.active ? "Activo" : "Inactivo"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <UserActions
                    userId={u.id}
                    active={u.active}
                    isProprietary={u.role === "PROPRIETARY"}
                    canManagePermissions={canManagePermissions}
                    canDeactivate={canDeactivate}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-[#E0D5CA] bg-[#FAF7F2] px-4 py-3 text-sm text-[#7A6358]">
        <strong className="text-[#2C1F15]">Solo sistema</strong> — usuarios sin personal vinculado. No aparecen en nómina, horas, bonos, propinas ni reportes de pago.
      </div>
    </div>
  );
}
