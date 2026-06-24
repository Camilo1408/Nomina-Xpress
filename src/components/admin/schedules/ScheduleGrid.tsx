"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";

interface Employee { id: string; name: string; }

interface ShiftData {
  startTime: string;
  endTime: string;
  startTime2: string;
  endTime2: string;
}

interface ShiftInput {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  startTime2?: string | null;
  endTime2?: string | null;
}

interface ScheduleGridProps {
  employees: Employee[];
  weekStart: string;
  existingSchedule?: {
    id: string;
    name: string;
    shifts: ShiftInput[];
  };
}

function getWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart + "T12:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().split("T")[0];
  });
}

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function ScheduleGrid({ employees, weekStart, existingSchedule }: ScheduleGridProps) {
  const router = useRouter();
  const weekDates = getWeekDates(weekStart);

  const buildKey = (empId: string, date: string) => `${empId}__${date}`;

  const initialShifts: Record<string, ShiftData> = {};
  const initialSplitKeys = new Set<string>();

  existingSchedule?.shifts.forEach((s) => {
    const key = buildKey(s.employeeId, s.date);
    initialShifts[key] = {
      startTime: s.startTime,
      endTime: s.endTime,
      startTime2: s.startTime2 ?? "",
      endTime2: s.endTime2 ?? "",
    };
    if (s.startTime2 || s.endTime2) {
      initialSplitKeys.add(key);
    }
  });

  const [shifts, setShifts] = useState(initialShifts);
  // splitKeys tracks which cells have the 2nd shift row visible
  const [splitKeys, setSplitKeys] = useState<Set<string>>(initialSplitKeys);
  const [scheduleName, setScheduleName] = useState(
    existingSchedule?.name ?? `Horario semana ${weekStart}`
  );
  const [loading, setLoading] = useState(false);

  function setShiftField(empId: string, date: string, field: keyof ShiftData, value: string) {
    const key = buildKey(empId, date);
    setShifts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { startTime: "", endTime: "", startTime2: "", endTime2: "" }),
        [field]: value,
      },
    }));
  }

  function toggleSplit(empId: string, date: string) {
    const key = buildKey(empId, date);
    setSplitKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Clear 2nd shift data when hiding
        setShifts((s) => ({
          ...s,
          [key]: { ...(s[key] ?? { startTime: "", endTime: "", startTime2: "", endTime2: "" }), startTime2: "", endTime2: "" },
        }));
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function clearShift(empId: string, date: string) {
    const key = buildKey(empId, date);
    setShifts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSplitKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function addShift(empId: string, date: string) {
    setShifts((prev) => ({
      ...prev,
      [buildKey(empId, date)]: { startTime: "", endTime: "", startTime2: "", endTime2: "" },
    }));
  }

  async function handleSave() {
    setLoading(true);
    const shiftArray: ShiftInput[] = Object.entries(shifts)
      .filter(([, v]) => v.startTime && v.endTime)
      .map(([key, v]) => {
        const [empId, date] = key.split("__");
        const hasSplit = splitKeys.has(key);
        return {
          employeeId: empId,
          date,
          startTime: v.startTime,
          endTime: v.endTime,
          startTime2: hasSplit && v.startTime2 ? v.startTime2 : null,
          endTime2: hasSplit && v.endTime2 ? v.endTime2 : null,
        };
      });

    const payload = { name: scheduleName, weekStart, shifts: shiftArray };
    const url = existingSchedule ? `/api/admin/schedules/${existingSchedule.id}` : "/api/admin/schedules";
    const method = existingSchedule ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);
    if (res.ok) {
      toast.success("Horario guardado");
      router.push("/admin/schedules");
      router.refresh();
    } else {
      toast.error("Error al guardar horario");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          value={scheduleName}
          onChange={(e) => setScheduleName(e.target.value)}
          className="max-w-xs"
          placeholder="Nombre del horario"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-[#2C1F15] bg-[#F2EDE6] border border-[#E0D5CA] min-w-32">
                Personal
              </th>
              {weekDates.map((date, i) => (
                <th key={date} className="px-3 py-2 font-semibold text-[#2C1F15] bg-[#F2EDE6] border border-[#E0D5CA] min-w-36 text-center">
                  <div>{DAY_NAMES[i]}</div>
                  <div className="text-xs font-normal text-[#7A6358]">{date.slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td className="px-3 py-2 border border-[#E0D5CA] font-medium text-[#2C1F15] bg-white">
                  {emp.name}
                </td>
                {weekDates.map((date) => {
                  const key = buildKey(emp.id, date);
                  const shift = shifts[key];
                  const showSplit = splitKeys.has(key);

                  return (
                    <td key={date} className="border border-[#E0D5CA] p-1.5 bg-white align-top">
                      {!shift ? (
                        <button
                          type="button"
                          onClick={() => addShift(emp.id, date)}
                          className="w-full flex items-center justify-center py-2 text-[#E0D5CA] hover:text-[#7A6358] transition-colors"
                          title="Agregar turno"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="space-y-1">
                          {/* Turno 1 */}
                          <div className="flex items-center gap-0.5">
                            <input
                              type="time"
                              value={shift.startTime}
                              onChange={(e) => setShiftField(emp.id, date, "startTime", e.target.value)}
                              className="flex-1 min-w-0 border border-[#E0D5CA] rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#C1643F]"
                            />
                            <span className="text-[10px] text-[#7A6358]">–</span>
                            <input
                              type="time"
                              value={shift.endTime}
                              onChange={(e) => setShiftField(emp.id, date, "endTime", e.target.value)}
                              className="flex-1 min-w-0 border border-[#E0D5CA] rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#C1643F]"
                            />
                          </div>

                          {/* Turno 2 — solo visible cuando showSplit es true */}
                          {showSplit && (
                            <div className="flex items-center gap-0.5">
                              <input
                                type="time"
                                value={shift.startTime2}
                                onChange={(e) => setShiftField(emp.id, date, "startTime2", e.target.value)}
                                className="flex-1 min-w-0 border border-[#C1643F]/40 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#C1643F] bg-[#FDF5F2]"
                              />
                              <span className="text-[10px] text-[#7A6358]">–</span>
                              <input
                                type="time"
                                value={shift.endTime2}
                                onChange={(e) => setShiftField(emp.id, date, "endTime2", e.target.value)}
                                className="flex-1 min-w-0 border border-[#C1643F]/40 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#C1643F] bg-[#FDF5F2]"
                              />
                            </div>
                          )}

                          {/* Acciones */}
                          <div className="flex items-center justify-between pt-0.5">
                            <button
                              type="button"
                              onClick={() => toggleSplit(emp.id, date)}
                              className="text-[9px] hover:underline transition-colors"
                              style={{ color: showSplit ? "#B94040" : "#C1643F" }}
                            >
                              {showSplit ? "- 2.º turno" : "+ 2.º turno"}
                            </button>
                            <button
                              type="button"
                              onClick={() => clearShift(emp.id, date)}
                              className="text-[#B94040] hover:opacity-70"
                              title="Quitar turno"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          disabled={loading}
          className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]"
        >
          {loading ? "Guardando..." : "Guardar horario"}
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push("/admin/schedules")}
          className="border-[#E0D5CA]"
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
