import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { UserPermissionsForm } from "@/components/admin/usuarios/UserPermissionsForm";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";
import { getDailyCategoriesForUI } from "@/lib/inventory-sync";

export default async function EditUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requirePagePermission(PERMISSIONS.USERS_MANAGE_PERMISSIONS);

  const { id } = await params;
  const { tenantId } = session.user;
  const dailyCategories = await getDailyCategoriesForUI(tenantId);

  const [user, customRoles] = await Promise.all([
    prisma.user.findFirst({
      where: { id, tenantId },
      include: {
        employee: { select: { name: true, active: true } },
        customRole: { select: { id: true, name: true, permissions: true, active: true } },
        userPermissions: { orderBy: { permissionKey: "asc" } },
      },
    }),
    prisma.customRole.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!user) notFound();

  if (user.role === "PROPRIETARY") {
    redirect("/admin/usuarios");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">
          Permisos: @{user.username}
        </h1>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge className="bg-[#C1643F]/10 text-[#C1643F] border-0">{user.role}</Badge>
          {user.employee ? (
            <span className="text-sm text-[#7A6358]">Empleado: {user.employee.name}</span>
          ) : (
            <Badge className="bg-[#8B6355]/10 text-[#8B6355] border-0">Solo sistema</Badge>
          )}
          {!user.active && (
            <Badge className="bg-[#B94040]/10 text-[#B94040] border-0">Inactivo</Badge>
          )}
        </div>
      </div>

      <UserPermissionsForm
        userId={user.id}
        username={user.username}
        baseRole={user.role}
        customRolePermissions={
          user.customRole?.active
            ? (JSON.parse(user.customRole.permissions) as string[])
            : null
        }
        currentOverrides={user.userPermissions}
        customRoles={customRoles}
        currentCustomRoleId={user.customRoleId}
        dailyCategories={dailyCategories}
      />
    </div>
  );
}
