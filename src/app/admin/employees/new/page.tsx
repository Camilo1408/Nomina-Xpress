import { EmployeeForm } from "@/components/admin/employees/EmployeeForm";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

export default async function NewEmployeePage() {
  await requirePagePermission(PERMISSIONS.EMPLOYEES_CREATE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Nuevo Personal</h1>
        <p className="text-sm text-[#7A6358] mt-1">Completa los datos del personal</p>
      </div>
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6">
        <EmployeeForm />
      </div>
    </div>
  );
}
