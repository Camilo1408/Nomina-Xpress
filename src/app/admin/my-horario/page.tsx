"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PushNotificationButton } from "@/components/portal/PushNotificationButton";

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  startTime2: string | null;
  endTime2: string | null;
}

interface Schedule {
  id: string;
  name: string;
  weekStart: string;
  published: boolean;
  shifts: Shift[];
}

export default function AdminMyHorarioPage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/employee/schedule")
      .then((r) => r.json())
      .then((data) => setSchedule(data.schedule))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-[#7A6358] text-sm">Cargando horario...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Mi Horario</h1>
          <p className="text-sm text-[#7A6358] mt-1">Horario publicado por el administrador</p>
        </div>
        <PushNotificationButton />
      </div>

      {schedule ? (
        <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E0D5CA] bg-[#F2EDE6] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#2C1F15]">{schedule.name}</h3>
            <Badge className="bg-[#6B8E6B]/15 text-[#6B8E6B] border-0">Publicado</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {DAY_NAMES.map((d) => (
                    <th key={d} className="px-4 py-2 text-center font-medium text-[#7A6358] border-r border-[#E0D5CA] last:border-0">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {Array.from({ length: 7 }, (_, i) => {
                    const start = new Date(schedule.weekStart + "T00:00:00");
                    start.setDate(start.getDate() + i);
                    const date = start.toISOString().split("T")[0];
                    const shift = schedule.shifts.find((s) => s.date === date);
                    return (
                      <td key={date} className="px-4 py-4 text-center border-r border-[#E0D5CA] last:border-0 align-top">
                        <p className="text-xs text-[#7A6358] mb-1">{date.slice(5)}</p>
                        {shift ? (
                          <div className="space-y-1.5">
                            <div className="space-y-0.5">
                              <p className="text-sm font-mono font-medium text-[#2C1F15]">{shift.startTime.slice(0, 5)}</p>
                              <p className="text-xs text-[#7A6358]">a</p>
                              <p className="text-sm font-mono font-medium text-[#2C1F15]">{shift.endTime.slice(0, 5)}</p>
                            </div>
                            {shift.startTime2 && shift.endTime2 && (
                              <div className="space-y-0.5 bg-[#FDF5F2] rounded px-1.5 py-1 border border-[#C1643F]/20">
                                <p className="text-xs font-mono font-medium text-[#C1643F]">{shift.startTime2.slice(0, 5)}</p>
                                <p className="text-xs text-[#C1643F]/60">a</p>
                                <p className="text-xs font-mono font-medium text-[#C1643F]">{shift.endTime2.slice(0, 5)}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-[#E0D5CA]">—</p>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
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
