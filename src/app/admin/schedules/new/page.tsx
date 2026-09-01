import { prisma } from "@/lib/db";
import { ScheduleGrid } from "@/components/admin/schedules/ScheduleGrid";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";
import { addDays, suggestWeekStart } from "@/lib/schedule-week";

export default async function NewSchedulePage() {
  const { session } = await requirePagePermission(PERMISSIONS.SCHEDULES_CREATE);
  const tenantId = session.user.tenantId;

  const [employees, schedules] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.schedule.findMany({
      where: { tenantId },
      select: { id: true, name: true, weekStart: true },
      orderBy: { weekStart: "desc" },
    }),
  ]);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());

  // El último día ya cubierto por el horario más reciente. Si todavía no ha
  // pasado, el horario nuevo arranca al día siguiente: así un domingo ya
  // asignado no se repite en una semana que ya se trabajó.
  const lastCoveredDay = schedules[0] ? addDays(schedules[0].weekStart, 6) : null;
  const weekStart = suggestWeekStart(lastCoveredDay, today);

  const existingRanges = schedules.map((s) => ({
    id: s.id,
    name: s.name,
    start: s.weekStart,
    end: addDays(s.weekStart, 6),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Nuevo Horario</h1>
        <p className="text-sm text-[#7A6358] mt-1">
          Elige el día de inicio y asigna turnos por personal y día
        </p>
      </div>
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6">
        <ScheduleGrid
          employees={employees}
          weekStart={weekStart}
          existingRanges={existingRanges}
        />
      </div>
    </div>
  );
}
