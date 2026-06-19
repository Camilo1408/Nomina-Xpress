import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { RoleForm } from "@/components/admin/roles/RoleForm";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requirePagePermission(PERMISSIONS.ROLES_EDIT);

  const { id } = await params;
  const role = await prisma.customRole.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      users: {
        select: { id: true, username: true, role: true, active: true, employee: { select: { name: true } } },
        orderBy: { username: "asc" },
      },
    },
  });
  if (!role) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">
          Editar rol: {role.name}
        </h1>
        <p className="text-sm text-[#7A6358] mt-1">
          {role.users.length} usuario{role.users.length !== 1 ? "s" : ""} con este rol.
        </p>
      </div>

      {role.isSystem ? (
        <div className="rounded-lg border border-[#D4A843]/30 bg-[#D4A843]/5 px-4 py-3 text-sm text-[#7A6358]">
          Este es un rol del sistema y no puede editarse.
        </div>
      ) : (
        <RoleForm
          role={{
            id: role.id,
            name: role.name,
            slug: role.slug,
            description: role.description,
            permissions: role.permissions,
            active: role.active,
            isSystem: role.isSystem,
          }}
        />
      )}

      {/* Usuarios con este rol */}
      {role.users.length > 0 && (
        <div className="bg-white rounded-lg border border-[#E0D5CA] p-4">
          <h3 className="text-sm font-semibold text-[#2C1F15] mb-3">Usuarios con este rol</h3>
          <ul className="space-y-2">
            {role.users.map((u) => (
              <li key={u.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-[#2C1F15]">@{u.username}</span>
                  {u.employee && <span className="text-[#7A6358] ml-2">— {u.employee.name}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-[#C1643F]/10 text-[#C1643F] border-0 text-xs">{u.role}</Badge>
                  {!u.active && (
                    <Badge className="bg-[#B94040]/10 text-[#B94040] border-0 text-xs">Inactivo</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
