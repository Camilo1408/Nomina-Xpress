import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { EmployeeActions } from "@/components/admin/employees/EmployeeActions";
import { BonusManager } from "@/components/admin/bonuses/BonusManager";
import { DiscountManager } from "@/components/admin/discounts/DiscountManager";
import { canAddEmployee, canDeactivateEmployee, canManageBonuses, canManageDiscounts } from "@/lib/permissions";

export default async function EmployeesPage() {
  const session = await auth();
  const tenantId = session!.user.tenantId;
  const role = session!.user.role;
  const canAdd = canAddEmployee(role);
  const canManageLifecycle = canDeactivateEmployee(role);
  const canBonuses = canManageBonuses(role);
  const canDiscounts = canManageDiscounts(role);

  const employees = await prisma.employee.findMany({
    where: { tenantId },
    include: { user: { select: { username: true } } },
    orderBy: { name: "asc" },
  });

  const bonusEmployees = employees.map((e) => ({
    id: e.id,
    name: e.name,
    payType: e.payType,
    active: e.active,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Empleados</h1>
          <p className="text-sm text-[#7A6358] mt-1">{employees.filter(e => e.active).length} activos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canBonuses && <BonusManager employees={bonusEmployees} />}
          {canDiscounts && <DiscountManager employees={bonusEmployees} />}
          {canAdd && (
            <Link href="/admin/employees/new">
              <Button className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-2">
                <Plus className="w-4 h-4" /> Nuevo empleado
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[#E0D5CA] bg-[#C1643F]/8">
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Nombre</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Cédula</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Tipo Pago</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">T. Normal</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">T. Especial</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Estado</th>
              <th className="text-right px-4 py-3 font-semibold text-[#2C1F15]">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, i) => (
              <tr
                key={emp.id}
                className={`border-b border-[#F2EDE6] last:border-0 ${i % 2 === 1 ? "bg-[#F2EDE6]/50" : ""}`}
              >
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-[#2C1F15]">{emp.name}</p>
                    {emp.user && <p className="text-xs text-[#7A6358]">@{emp.user.username}</p>}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#7A6358] font-mono">{emp.documentId ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge
                    className={emp.payType === "SHIFT"
                      ? "bg-[#8B6355]/15 text-[#8B6355] border-0"
                      : "bg-[#C1643F]/15 text-[#C1643F] border-0"
                    }
                  >
                    {emp.payType === "SHIFT" ? "Turnos" : "Nómina"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-[#2C1F15] font-mono">{formatCurrency(emp.hourlyRateNormal)}</td>
                <td className="px-4 py-3 text-[#2C1F15] font-mono">{formatCurrency(emp.hourlyRateSpecial)}</td>
                <td className="px-4 py-3">
                  <Badge
                    className={emp.active
                      ? "bg-[#6B8E6B]/15 text-[#6B8E6B] border-0"
                      : "bg-[#B94040]/10 text-[#B94040] border-0"
                    }
                  >
                    {emp.active ? "Activo" : "Inactivo"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <EmployeeActions
                    employeeId={emp.id}
                    active={emp.active}
                    canManageLifecycle={canManageLifecycle}
                  />
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#7A6358]">
                  No hay empleados registrados.{" "}
                  {canAdd && (
                    <Link href="/admin/employees/new" className="text-[#C1643F] hover:underline">
                      Crear el primero
                    </Link>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
