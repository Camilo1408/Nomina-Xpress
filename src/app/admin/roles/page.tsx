import { prisma } from "@/lib/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { RoleActions } from "@/components/admin/roles/RoleActions";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

export default async function RolesPage() {
  const { session, permissions } = await requirePagePermission(PERMISSIONS.ROLES_VIEW);
  const canCreate = permissions.has(PERMISSIONS.ROLES_CREATE);
  const canEdit = permissions.has(PERMISSIONS.ROLES_EDIT);
  const canDeactivate = permissions.has(PERMISSIONS.ROLES_DEACTIVATE);

  const roles = await prisma.customRole.findMany({
    where: { tenantId: session.user.tenantId },
    include: {
      _count: { select: { users: true } },
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Roles personalizados</h1>
          <p className="text-sm text-[#7A6358] mt-1">
            Define conjuntos de permisos asignables a usuarios del portal.
          </p>
        </div>
        {canCreate && (
          <Link href="/admin/roles/new">
            <Button className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-2">
              <Plus className="w-4 h-4" /> Nuevo rol
            </Button>
          </Link>
        )}
      </div>

      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-x-auto">
        <table className="w-full min-w-[500px] text-sm">
          <thead>
            <tr className="border-b border-[#E0D5CA] bg-[#C1643F]/8">
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Nombre</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Permisos</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Usuarios</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Estado</th>
              <th className="text-right px-4 py-3 font-semibold text-[#2C1F15]">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role, i) => {
              const perms = JSON.parse(role.permissions) as string[];
              return (
                <tr
                  key={role.id}
                  className={`border-b border-[#F2EDE6] last:border-0 ${i % 2 === 1 ? "bg-[#F2EDE6]/50" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-[#2C1F15]">{role.name}</p>
                      {role.description && (
                        <p className="text-xs text-[#7A6358]">{role.description}</p>
                      )}
                      <p className="text-xs text-[#7A6358] font-mono">{role.slug}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#7A6358]">
                    {perms.length} permiso{perms.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3 text-[#2C1F15]">{role._count.users}</td>
                  <td className="px-4 py-3">
                    <Badge
                      className={
                        role.active
                          ? "bg-[#6B8E6B]/15 text-[#6B8E6B] border-0"
                          : "bg-[#B94040]/10 text-[#B94040] border-0"
                      }
                    >
                      {role.active ? "Activo" : "Inactivo"}
                    </Badge>
                    {role.isSystem && (
                      <Badge className="ml-1.5 bg-[#D4A843]/10 text-[#D4A843] border-0">
                        Sistema
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RoleActions
                      roleId={role.id}
                      roleName={role.name}
                      active={role.active}
                      isSystem={role.isSystem}
                      userCount={role._count.users}
                      canEdit={canEdit}
                      canDeactivate={canDeactivate}
                    />
                  </td>
                </tr>
              );
            })}
            {roles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[#7A6358]">
                  No hay roles personalizados.{" "}
                  <Link href="/admin/roles/new" className="text-[#C1643F] hover:underline">
                    Crear el primero
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Info sobre roles base del sistema */}
      <div className="rounded-lg border border-[#E0D5CA] bg-[#FAF7F2] p-4">
        <h3 className="text-sm font-semibold text-[#2C1F15] mb-2">Roles base del sistema</h3>
        <div className="space-y-1 text-sm text-[#7A6358]">
          <p><strong className="text-[#2C1F15]">EMPLOYEE</strong> — Acceso solo al portal del personal (mi quincena, mi horario).</p>
          <p><strong className="text-[#2C1F15]">ADMIN</strong> — Portal admin: registro de horas, propinas, reportes, perfil.</p>
          <p><strong className="text-[#2C1F15]">SUPERADMIN</strong> — Todo ADMIN + personal, horarios, bonos, descuentos, configuración.</p>
          <p><strong className="text-[#2C1F15]">PROPRIETARY</strong> — Todos los permisos. Gestiona roles, usuarios, auditoría y configuración avanzada.</p>
        </div>
        <p className="text-xs text-[#7A6358] mt-3">
          Los roles personalizados reemplazan los permisos del rol base cuando se asignan a un usuario.
          Los overrides individuales se aplican sobre el rol (base o personalizado).
        </p>
      </div>
    </div>
  );
}
