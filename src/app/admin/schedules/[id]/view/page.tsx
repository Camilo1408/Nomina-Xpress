import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ScheduleDetailActions } from "@/components/admin/schedules/ScheduleDetailActions";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function getWeekDates(weekStart: string): string[] {
  const [y, m, d] = weekStart.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(y, m - 1, d + i);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  });
}

function fmt(time: string) {
  return time.slice(0, 5);
}

function formatDayHeader(dateStr: string, label: string) {
  const [, m, d] = dateStr.split("-");
  return { label, date: `${d}/${m}` };
}

export default async function ScheduleViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session, permissions } = await requirePagePermission(PERMISSIONS.SCHEDULES_VIEW);
  const { id } = await params;

  const schedule = await prisma.schedule.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      shifts: {
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { date: "asc" },
      },
    },
  });

  if (!schedule) notFound();

  const weekDates = getWeekDates(schedule.weekStart);

  // Build employee list ordered by first appearance
  const employeeMap = new Map<string, string>();
  for (const shift of schedule.shifts) {
    if (!employeeMap.has(shift.employeeId)) {
      employeeMap.set(shift.employeeId, shift.employee.name);
    }
  }
  const employees = Array.from(employeeMap.entries()).map(([id, name]) => ({ id, name }));

  // Index shifts by empId__date
  const shiftIndex = new Map<string, typeof schedule.shifts[0]>();
  for (const shift of schedule.shifts) {
    shiftIndex.set(`${shift.employeeId}__${shift.date}`, shift);
  }

  const totalShifts = schedule.shifts.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/admin/schedules">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mt-0.5 text-[#7A6358] hover:text-[#2C1F15]">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">{schedule.name}</h1>
              <Badge className={schedule.published ? "bg-[#6B8E6B]/15 text-[#6B8E6B] border-0" : "bg-[#7A6358]/10 text-[#7A6358] border-0"}>
                {schedule.published ? "Publicado" : "Borrador"}
              </Badge>
            </div>
            <p className="text-sm text-[#7A6358] mt-0.5">
              Semana del {schedule.weekStart} · {employees.length} personal · {totalShifts} turno{totalShifts !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <ScheduleDetailActions
          scheduleId={schedule.id}
          published={schedule.published}
          canEdit={permissions.has(PERMISSIONS.SCHEDULES_EDIT)}
          canPublish={permissions.has(PERMISSIONS.SCHEDULES_PUBLISH)}
          canDelete={permissions.has(PERMISSIONS.SCHEDULES_DELETE)}
        />
      </div>

      {/* Schedule grid */}
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[#E0D5CA] bg-[#F2EDE6]/60">
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15] w-40">Personal</th>
              {weekDates.map((date, i) => {
                const { label, date: dayDate } = formatDayHeader(date, DAY_LABELS[i]);
                const isSunday = i === 6;
                const isSat = i === 5;
                return (
                  <th
                    key={date}
                    className={`text-center px-2 py-3 font-semibold ${isSunday ? "text-[#C1643F]" : isSat ? "text-[#8B6355]" : "text-[#2C1F15]"}`}
                  >
                    <span className="block">{label}</span>
                    <span className="block text-xs font-normal text-[#7A6358]">{dayDate}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[#7A6358]">
                  Este horario no tiene turnos asignados.
                </td>
              </tr>
            )}
            {employees.map((emp, empIdx) => (
              <tr
                key={emp.id}
                className={`border-b border-[#F2EDE6] last:border-0 ${empIdx % 2 === 1 ? "bg-[#FAF7F2]/50" : ""}`}
              >
                <td className="px-4 py-3 font-medium text-[#2C1F15] whitespace-nowrap">{emp.name}</td>
                {weekDates.map((date, i) => {
                  const shift = shiftIndex.get(`${emp.id}__${date}`);
                  const isSunday = i === 6;
                  return (
                    <td key={date} className="px-2 py-3 text-center align-top">
                      {shift ? (
                        <div className="space-y-1">
                          <span className={`block text-xs font-mono font-medium ${isSunday ? "text-[#C1643F]" : "text-[#2C1F15]"}`}>
                            {fmt(shift.startTime)}–{fmt(shift.endTime)}
                          </span>
                          {shift.startTime2 && shift.endTime2 && (
                            <span className="block text-xs font-mono text-[#C1643F]/80 bg-[#FDF5F2] rounded px-1 py-0.5">
                              {fmt(shift.startTime2)}–{fmt(shift.endTime2)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#C8BDB6] text-xs">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      {totalShifts > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-[#7A6358]">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-medium text-[#2C1F15]">HH:MM–HH:MM</span>
            <span>Turno regular</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[#C1643F]/80 bg-[#FDF5F2] rounded px-1 py-0.5">HH:MM–HH:MM</span>
            <span>2.º turno</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-medium text-[#C1643F]">Dom</span>
            <span>Domingo (tarifa especial)</span>
          </div>
        </div>
      )}
    </div>
  );
}
