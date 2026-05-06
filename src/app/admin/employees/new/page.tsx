import { EmployeeForm } from "@/components/admin/employees/EmployeeForm";

export default function NewEmployeePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Nuevo Empleado</h1>
        <p className="text-sm text-[#7A6358] mt-1">Completa los datos del empleado</p>
      </div>
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6">
        <EmployeeForm />
      </div>
    </div>
  );
}
