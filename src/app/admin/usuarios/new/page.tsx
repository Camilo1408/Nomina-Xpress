import { prisma } from "@/lib/db";
import { NewUserForm } from "@/components/admin/usuarios/NewUserForm";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

export default async function NewUsuarioPage() {
  const { session } = await requirePagePermission(PERMISSIONS.USERS_CREATE);

  const [customRoles, employees] = await Promise.all([
    prisma.customRole.findMany({
      where: { tenantId: session.user.tenantId, active: true },
      orderBy: { name: "asc" },
    }),
    // Solo empleados sin usuario asignado aún
    prisma.employee.findMany({
      where: {
        tenantId: session.user.tenantId,
        active: true,
        user: null,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Nuevo usuario del portal</h1>
        <p className="text-sm text-[#7A6358] mt-1">
          Crea un usuario solo del sistema (no pagable) o vincula uno a un empleado existente.
        </p>
      </div>
      <NewUserForm customRoles={customRoles} employees={employees} />
    </div>
  );
}
