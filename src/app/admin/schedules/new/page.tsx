import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ScheduleGrid } from "@/components/admin/schedules/ScheduleGrid";

function getMonday(todayStr: string): string {
  const [y, m, d] = todayStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  const yr = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const dy = String(date.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
}

export default async function NewSchedulePage() {
  const session = await auth();
  const employees = await prisma.employee.findMany({
    where: { tenantId: session!.user.tenantId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const weekStart = getMonday(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Nuevo Horario</h1>
        <p className="text-sm text-[#7A6358] mt-1">Asigna turnos por empleado y día</p>
      </div>
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6">
        <ScheduleGrid employees={employees} weekStart={weekStart} />
      </div>
    </div>
  );
}
