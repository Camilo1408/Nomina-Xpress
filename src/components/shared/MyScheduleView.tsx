"use client";

/**
 * Vista del horario propio, compartida por el portal del empleado
 * (`/portal/schedule`) y por el admin que consulta el suyo
 * (`/admin/my-horario`).
 *
 * Antes eran dos archivos idénticos copiados; cualquier cambio había que
 * hacerlo dos veces, con el riesgo de que se desincronizaran.
 */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Moon } from "lucide-react";
import { PushNotificationButton } from "@/components/portal/PushNotificationButton";
import { ScrollableWeek } from "@/components/shared/ScrollableWeek";
import { formatTime12 } from "@/lib/shift-times";
import {
  getWeekDates,
  dayLabelFor,
  isSunday,
  formatDayNumber,
} from "@/lib/schedule-week";

interface Shift {
  id: string;
  date: string;
  /** `null` en un día de descanso. */
  startTime: string | null;
  endTime: string | null;
  startTime2: string | null;
  endTime2: string | null;
  restDay: boolean;
}

interface Schedule {
  id: string;
  name: string;
  weekStart: string;
  published: boolean;
  shifts: Shift[];
}

export function MyScheduleView() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/employee/schedule")
      .then((r) => r.json())
      .then((data) => setSchedule(data.schedule))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-[#7A6358] text-sm">Cargando horario...</div>;
  }

  const weekDates = schedule ? getWeekDates(schedule.weekStart) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Mi Horario</h1>
          <p className="text-sm text-[#7A6358] mt-1">
            Horario publicado por el administrador
          </p>
        </div>
        <PushNotificationButton />
      </div>

      {schedule ? (
        <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E0D5CA] bg-[#F2EDE6] flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[#2C1F15]">{schedule.name}</h3>
            <Badge className="bg-[#6B8E6B]/15 text-[#6B8E6B] border-0">Publicado</Badge>
          </div>

          <div className="p-2 pb-3">
            <ScrollableWeek>
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr>
                    {weekDates.map((date) => (
                      <th
                        key={date}
                        className={`px-4 py-2 text-center font-medium border-r border-[#E0D5CA] last:border-0 ${
                          isSunday(date) ? "text-[#C1643F]" : "text-[#7A6358]"
                        }`}
                      >
                        {dayLabelFor(date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {weekDates.map((date) => {
                      const shift = schedule.shifts.find((s) => s.date === date);
                      return (
                        <td
                          key={date}
                          className="px-3 py-4 text-center border-r border-[#E0D5CA] last:border-0 align-top"
                        >
                          <p className="text-xs text-[#7A6358] mb-1.5">
                            {formatDayNumber(date)}
                          </p>

                          {!shift ? (
                            <p className="text-xs text-[#C8BDB6]">—</p>
                          ) : shift.restDay ? (
                            <p className="inline-flex items-center gap-1 rounded bg-[#6B8E6B]/12 border border-[#6B8E6B]/30 px-2 py-1 text-xs font-medium text-[#4F704F]">
                              <Moon className="w-3 h-3" /> Descansa
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="space-y-0.5">
                                <p className="text-sm font-medium text-[#2C1F15] whitespace-nowrap">
                                  {formatTime12(shift.startTime)}
                                </p>
                                <p className="text-xs text-[#7A6358]">a</p>
                                <p className="text-sm font-medium text-[#2C1F15] whitespace-nowrap">
                                  {formatTime12(shift.endTime)}
                                </p>
                              </div>
                              {shift.startTime2 && shift.endTime2 && (
                                <div className="space-y-0.5 bg-[#FDF5F2] rounded px-1.5 py-1 border border-[#C1643F]/20">
                                  <p className="text-[10px] uppercase tracking-wide text-[#C1643F]/70">
                                    2.º turno
                                  </p>
                                  <p className="text-xs font-medium text-[#C1643F] whitespace-nowrap">
                                    {formatTime12(shift.startTime2)}
                                  </p>
                                  <p className="text-xs text-[#C1643F]/60">a</p>
                                  <p className="text-xs font-medium text-[#C1643F] whitespace-nowrap">
                                    {formatTime12(shift.endTime2)}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </ScrollableWeek>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-[#7A6358]">
          No hay horario publicado para esta semana.
        </div>
      )}
    </div>
  );
}
