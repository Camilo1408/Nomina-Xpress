import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Moon } from "lucide-react";
import { ScheduleDetailActions } from "@/components/admin/schedules/ScheduleDetailActions";
import { ScrollableWeek } from "@/components/shared/ScrollableWeek";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";
import { formatTime12 } from "@/lib/shift-times";
import {
  getWeekDates,
  dayLabelFor,
  dayNameFor,
  isSunday,
  formatDayNumber,
} from "@/lib/schedule-week";

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

  // Lista de personal por orden de aparición
  const employeeMap = new Map<string, string>();
  for (const shift of schedule.shifts) {
    if (!employeeMap.has(shift.employeeId)) {
      employeeMap.set(shift.employeeId, shift.employee.name);
    }
  }
  const employees = Array.from(employeeMap.entries()).map(([id, name]) => ({ id, name }));

  // Índice de turnos por empId__fecha
  const shiftIndex = new Map<string, (typeof schedule.shifts)[0]>();
  for (const shift of schedule.shifts) {
    shiftIndex.set(`${shift.employeeId}__${shift.date}`, shift);
  }

  const workShifts = schedule.shifts.filter((s) => !s.restDay).length;
  const restDays = schedule.shifts.filter((s) => s.restDay).length;

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/admin/schedules">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 mt-0.5 text-[#7A6358] hover:text-[#2C1F15]"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">
                {schedule.name}
              </h1>
              <Badge
                className={
                  schedule.published
                    ? "bg-[#6B8E6B]/15 text-[#6B8E6B] border-0"
                    : "bg-[#7A6358]/10 text-[#7A6358] border-0"
                }
              >
                {schedule.published ? "Publicado" : "Borrador"}
              </Badge>
            </div>
            <p className="text-sm text-[#7A6358] mt-0.5">
              Del {dayNameFor(schedule.weekStart)} {formatDayNumber(schedule.weekStart)} al{" "}
              {dayNameFor(weekDates[6])} {formatDayNumber(weekDates[6])} ·{" "}
              {employees.length} personal · {workShifts} turno
              {workShifts !== 1 ? "s" : ""}
              {restDays > 0 && ` · ${restDays} día${restDays !== 1 ? "s" : ""} de descanso`}
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

      {/* Parrilla */}
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-2 pb-3">
        <ScrollableWeek>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[#E0D5CA] bg-[#F2EDE6]/60">
                <th className="sticky left-0 z-10 bg-[#F2EDE6] text-left px-4 py-3 font-semibold text-[#2C1F15] w-40">
                  Personal
                </th>
                {weekDates.map((date) => (
                  <th
                    key={date}
                    className={`text-center px-2 py-3 font-semibold ${
                      isSunday(date) ? "text-[#C1643F]" : "text-[#2C1F15]"
                    }`}
                  >
                    <span className="block">{dayLabelFor(date)}</span>
                    <span className="block text-xs font-normal text-[#7A6358]">
                      {formatDayNumber(date)}
                    </span>
                  </th>
                ))}
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
                  className={`border-b border-[#F2EDE6] last:border-0 ${
                    empIdx % 2 === 1 ? "bg-[#FAF7F2]/50" : ""
                  }`}
                >
                  <td
                    className={`sticky left-0 z-10 px-4 py-3 font-medium text-[#2C1F15] whitespace-nowrap ${
                      empIdx % 2 === 1 ? "bg-[#FAF7F2]" : "bg-white"
                    }`}
                  >
                    {emp.name}
                  </td>
                  {weekDates.map((date) => {
                    const shift = shiftIndex.get(`${emp.id}__${date}`);
                    const sunday = isSunday(date);
                    return (
                      <td key={date} className="px-2 py-3 text-center align-top">
                        {!shift ? (
                          <span className="text-[#C8BDB6] text-xs">—</span>
                        ) : shift.restDay ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[#6B8E6B]/12 border border-[#6B8E6B]/30 px-1.5 py-0.5 text-[11px] font-medium text-[#4F704F]">
                            <Moon className="w-3 h-3" /> Descansa
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <span
                              className={`block text-xs font-medium whitespace-nowrap ${
                                sunday ? "text-[#C1643F]" : "text-[#2C1F15]"
                              }`}
                            >
                              {formatTime12(shift.startTime)}
                              <span className="text-[#7A6358]"> a </span>
                              {formatTime12(shift.endTime)}
                            </span>
                            {shift.startTime2 && shift.endTime2 && (
                              <span className="block text-xs text-[#C1643F]/90 bg-[#FDF5F2] rounded px-1 py-0.5 whitespace-nowrap">
                                {formatTime12(shift.startTime2)}
                                <span className="text-[#C1643F]/60"> a </span>
                                {formatTime12(shift.endTime2)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableWeek>
      </div>

      {/* Leyenda */}
      {schedule.shifts.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-[#7A6358]">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-[#2C1F15]">8:00 a. m. a 3:00 p. m.</span>
            <span>Turno regular</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#C1643F]/90 bg-[#FDF5F2] rounded px-1 py-0.5">
              2.º turno
            </span>
            <span>Turno partido</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded bg-[#6B8E6B]/12 border border-[#6B8E6B]/30 px-1.5 py-0.5 text-[#4F704F]">
              <Moon className="w-3 h-3" /> Descansa
            </span>
            <span>Día de descanso (el empleado lo ve)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#C8BDB6]">—</span>
            <span>Sin asignar (el empleado no ve nada)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-[#C1643F]">Dom</span>
            <span>Domingo (tarifa especial)</span>
          </div>
        </div>
      )}
    </div>
  );
}
