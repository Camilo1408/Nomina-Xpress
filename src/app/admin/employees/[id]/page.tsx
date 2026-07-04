import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { EmployeeForm } from "@/components/admin/employees/EmployeeForm";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requirePagePermission(PERMISSIONS.EMPLOYEES_EDIT);
  const { id } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: { user: { select: { username: true, role: true, inventoryAccess: true } } },
  });

  if (!employee) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Editar Personal</h1>
        <p className="text-sm text-[#7A6358] mt-1">{employee.name}</p>
      </div>
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6">
        <EmployeeForm
          employee={employee}
          existingUser={employee.user ? { username: employee.user.username, role: employee.user.role, inventoryAccess: employee.user.inventoryAccess } : null}
        />
      </div>
    </div>
  );
}
