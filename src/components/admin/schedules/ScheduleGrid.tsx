"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeInput12 } from "@/components/ui/time-input-12";
import { ScrollableWeek } from "@/components/shared/ScrollableWeek";
import { Plus, X, Moon, AlertTriangle } from "lucide-react";
import {
  getWeekDates,
  dayLabelFor,
  dayNameFor,
  isSunday,
  formatDayNumber,
  findOverlaps,
  type WeekRange,
} from "@/lib/schedule-week";

interface Employee {
  id: string;
  name: string;
}

interface ShiftData {
  startTime: string;
  endTime: string;
  startTime2: string;
  endTime2: string;
  restDay: boolean;
}

interface ShiftInput {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  startTime2?: string | null;
  endTime2?: string | null;
  restDay?: boolean;
}

interface ScheduleGridProps {
  employees: Employee[];
  weekStart: string;
  /** Horarios ya existentes, para avisar de solapamientos. */
  existingRanges?: WeekRange[];
  existingSchedule?: {
    id: string;
    name: string;
    shifts: ShiftInput[];
  };
}

const EMPTY_SHIFT: ShiftData = {
  startTime: "",
  endTime: "",
  startTime2: "",
  endTime2: "",
  restDay: false,
};

function defaultName(weekStart: string) {
  return `Horario semana ${weekStart}`;
}

/**
 * Una hora del turno con su etiqueta. Sin la etiqueta, las dos filas de
 * selectores de una celda son indistinguibles y no se sabe cuál es la entrada.
 */
function TimeField({
  label,
  value,
  onChange,
  ariaLabel,
  accent = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <span
        aria-hidden
        className={`w-8 shrink-0 text-[10px] ${accent ? "text-[#C1643F]/80" : "text-[#7A6358]"}`}
      >
        {label}
      </span>
      <TimeInput12
        value={value}
        onChange={onChange}
        ariaLabel={ariaLabel}
        accent={accent}
      />
    </div>
  );
}

export function ScheduleGrid({
  employees,
  weekStart: initialWeekStart,
  existingRanges = [],
  existingSchedule,
}: ScheduleGridProps) {
  const router = useRouter();

  const buildKey = (empId: string, date: string) => `${empId}__${date}`;

  const initialShifts: Record<string, ShiftData> = {};
  const initialSplitKeys = new Set<string>();

  existingSchedule?.shifts.forEach((s) => {
    const key = buildKey(s.employeeId, s.date);
    const restDay = s.restDay ?? false;
    initialShifts[key] = {
      startTime: restDay ? "" : s.startTime,
      endTime: restDay ? "" : s.endTime,
      startTime2: restDay ? "" : s.startTime2 ?? "",
      endTime2: restDay ? "" : s.endTime2 ?? "",
      restDay,
    };
    if (!restDay && (s.startTime2 || s.endTime2)) {
      initialSplitKeys.add(key);
    }
  });

  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [shifts, setShifts] = useState(initialShifts);
  // splitKeys marca las celdas que tienen visible la fila del 2.º turno
  const [splitKeys, setSplitKeys] = useState<Set<string>>(initialSplitKeys);
  const [scheduleName, setScheduleName] = useState(
    existingSchedule?.name ?? defaultName(initialWeekStart)
  );
  // Si el admin escribe su propio nombre, dejamos de sobrescribirlo al cambiar
  // la fecha de inicio.
  const [nameEdited, setNameEdited] = useState(Boolean(existingSchedule));
  const [loading, setLoading] = useState(false);

  const weekDates = getWeekDates(weekStart);
  const overlaps = findOverlaps(weekStart, existingRanges, existingSchedule?.id);

  /**
   * Cambia la fecha de inicio. Las celdas cuya fecha sigue dentro de la semana
   * nueva se conservan; si alguna quedaría fuera, se pide confirmación antes de
   * descartarla — es trabajo que el admin ya había capturado.
   */
  function handleWeekStartChange(nextStart: string) {
    if (!nextStart || nextStart === weekStart) return;

    const nextDates = new Set(getWeekDates(nextStart));
    const dropped = Object.keys(shifts).filter(
      (key) => !nextDates.has(key.split("__")[1])
    );

    if (dropped.length > 0) {
      const ok = window.confirm(
        `Al cambiar la fecha de inicio, ${dropped.length} día(s) ya capturados ` +
          `quedan fuera de la semana y se descartarán.\n\n¿Continuar?`
      );
      if (!ok) return;

      setShifts((prev) => {
        const next = { ...prev };
        dropped.forEach((key) => delete next[key]);
        return next;
      });
      setSplitKeys((prev) => {
        const next = new Set(prev);
        dropped.forEach((key) => next.delete(key));
        return next;
      });
    }

    setWeekStart(nextStart);
    if (!nameEdited) setScheduleName(defaultName(nextStart));
  }

  function setShiftField(
    empId: string,
    date: string,
    field: keyof ShiftData,
    value: string
  ) {
    const key = buildKey(empId, date);
    setShifts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? EMPTY_SHIFT), [field]: value },
    }));
  }

  function toggleSplit(empId: string, date: string) {
    const key = buildKey(empId, date);
    setSplitKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Limpiar el 2.º turno al ocultarlo
        setShifts((s) => ({
          ...s,
          [key]: { ...(s[key] ?? EMPTY_SHIFT), startTime2: "", endTime2: "" },
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
      [buildKey(empId, date)]: { ...EMPTY_SHIFT },
    }));
  }

  /** Marca el día como descanso: el empleado lo verá, en vez de una celda vacía. */
  function markRestDay(empId: string, date: string) {
    const key = buildKey(empId, date);
    setShifts((prev) => ({ ...prev, [key]: { ...EMPTY_SHIFT, restDay: true } }));
    setSplitKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  async function handleSave() {
    setLoading(true);
    const shiftArray: ShiftInput[] = Object.entries(shifts)
      // Un descanso se guarda aunque no tenga horas; un turno solo si las tiene.
      .filter(([, v]) => v.restDay || (v.startTime && v.endTime))
      .map(([key, v]) => {
        const [empId, date] = key.split("__");
        if (v.restDay) {
          return {
            employeeId: empId,
            date,
            startTime: "",
            endTime: "",
            startTime2: null,
            endTime2: null,
            restDay: true,
          };
        }
        const hasSplit = splitKeys.has(key);
        return {
          employeeId: empId,
          date,
          startTime: v.startTime,
          endTime: v.endTime,
          startTime2: hasSplit && v.startTime2 ? v.startTime2 : null,
          endTime2: hasSplit && v.endTime2 ? v.endTime2 : null,
          restDay: false,
        };
      });

    const payload = { name: scheduleName, weekStart, shifts: shiftArray };
    const url = existingSchedule
      ? `/api/admin/schedules/${existingSchedule.id}`
      : "/api/admin/schedules";
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
      {/* Nombre y fecha de inicio */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="space-y-1">
          <label
            htmlFor="schedule-name"
            className="block text-xs font-medium text-[#7A6358]"
          >
            Nombre del horario
          </label>
          <Input
            id="schedule-name"
            value={scheduleName}
            onChange={(e) => {
              setScheduleName(e.target.value);
              setNameEdited(true);
            }}
            className="w-full sm:w-64"
            placeholder="Nombre del horario"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="week-start"
            className="block text-xs font-medium text-[#7A6358]"
          >
            La semana empieza el
          </label>
          <input
            id="week-start"
            type="date"
            value={weekStart}
            onChange={(e) => handleWeekStartChange(e.target.value)}
            className="w-full sm:w-auto rounded-md border border-[#E0D5CA] bg-white px-3 py-2 text-sm text-[#2C1F15] focus:outline-none focus:border-[#C1643F]"
          />
          <p className="text-[11px] text-[#7A6358]">
            {dayNameFor(weekStart)} {formatDayNumber(weekStart)} al{" "}
            {dayNameFor(weekDates[6])} {formatDayNumber(weekDates[6])}
          </p>
        </div>
      </div>

      {/* Aviso de solapamiento — informativo, no bloquea */}
      {overlaps.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-[#C1643F]/30 bg-[#FDF5F2] px-3 py-2 text-xs text-[#8B4A2B]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            Esta semana se solapa con{" "}
            {overlaps.map((r) => `«${r.name}»`).join(", ")}. Puedes continuar si
            es a propósito.
          </p>
        </div>
      )}

      <ScrollableWeek>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 text-left px-3 py-2 font-semibold text-[#2C1F15] bg-[#F2EDE6] border border-[#E0D5CA] min-w-32">
                Personal
              </th>
              {weekDates.map((date) => (
                <th
                  key={date}
                  className={`px-3 py-2 font-semibold bg-[#F2EDE6] border border-[#E0D5CA] min-w-48 text-center ${
                    isSunday(date) ? "text-[#C1643F]" : "text-[#2C1F15]"
                  }`}
                >
                  <div>{dayLabelFor(date)}</div>
                  <div className="text-xs font-normal text-[#7A6358]">
                    {formatDayNumber(date)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td className="sticky left-0 z-10 px-3 py-2 border border-[#E0D5CA] font-medium text-[#2C1F15] bg-white">
                  {emp.name}
                </td>
                {weekDates.map((date) => {
                  const key = buildKey(emp.id, date);
                  const shift = shifts[key];
                  const showSplit = splitKeys.has(key);

                  return (
                    <td
                      key={date}
                      className="border border-[#E0D5CA] p-1.5 bg-white align-top"
                    >
                      {!shift ? (
                        // Celda vacía: asignar turno, o marcar descanso.
                        <div className="flex flex-col items-stretch gap-1">
                          <button
                            type="button"
                            onClick={() => addShift(emp.id, date)}
                            className="flex items-center justify-center gap-1 py-1.5 rounded text-[#C1643F] hover:bg-[#FDF5F2] transition-colors text-[11px]"
                            title="Asignar turno"
                          >
                            <Plus className="w-3.5 h-3.5" /> Turno
                          </button>
                          <button
                            type="button"
                            onClick={() => markRestDay(emp.id, date)}
                            className="flex items-center justify-center gap-1 py-1.5 rounded text-[#6B8E6B] hover:bg-[#6B8E6B]/10 transition-colors text-[11px]"
                            title="Marcar como día de descanso"
                          >
                            <Moon className="w-3.5 h-3.5" /> Descansa
                          </button>
                        </div>
                      ) : shift.restDay ? (
                        // Día de descanso: el empleado lo ve explícitamente.
                        <div className="flex items-center justify-between gap-1 rounded bg-[#6B8E6B]/12 border border-[#6B8E6B]/30 px-2 py-2">
                          <span className="flex items-center gap-1 text-xs font-medium text-[#4F704F]">
                            <Moon className="w-3.5 h-3.5" /> Descansa
                          </span>
                          <button
                            type="button"
                            onClick={() => clearShift(emp.id, date)}
                            className="text-[#B94040] hover:opacity-70"
                            title="Quitar"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {/* Turno 1 */}
                          <TimeField
                            label="Entra"
                            value={shift.startTime}
                            onChange={(v) =>
                              setShiftField(emp.id, date, "startTime", v)
                            }
                            ariaLabel={`Entrada de ${emp.name}, ${dayNameFor(date)} ${formatDayNumber(date)}`}
                          />
                          <TimeField
                            label="Sale"
                            value={shift.endTime}
                            onChange={(v) =>
                              setShiftField(emp.id, date, "endTime", v)
                            }
                            ariaLabel={`Salida de ${emp.name}, ${dayNameFor(date)} ${formatDayNumber(date)}`}
                          />

                          {/* Turno 2 — solo visible cuando showSplit es true */}
                          {showSplit && (
                            <div className="space-y-1 pt-1 mt-1 border-t border-dashed border-[#C1643F]/40">
                              <p className="text-[9px] uppercase tracking-wide text-[#C1643F]/80">
                                2.º turno
                              </p>
                              <TimeField
                                accent
                                label="Entra"
                                value={shift.startTime2}
                                onChange={(v) =>
                                  setShiftField(emp.id, date, "startTime2", v)
                                }
                                ariaLabel={`Entrada del 2.º turno de ${emp.name}, ${dayNameFor(date)} ${formatDayNumber(date)}`}
                              />
                              <TimeField
                                accent
                                label="Sale"
                                value={shift.endTime2}
                                onChange={(v) =>
                                  setShiftField(emp.id, date, "endTime2", v)
                                }
                                ariaLabel={`Salida del 2.º turno de ${emp.name}, ${dayNameFor(date)} ${formatDayNumber(date)}`}
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
      </ScrollableWeek>

      {/* Leyenda de los tres estados de una celda */}
      <div className="flex flex-wrap gap-4 text-[11px] text-[#7A6358]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm border border-[#E0D5CA] bg-white" />
          Sin asignar — el empleado no ve nada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm border border-[#6B8E6B]/40 bg-[#6B8E6B]/20" />
          Descansa — el empleado lo ve en su horario
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm border border-[#C1643F]/40 bg-[#FDF5F2]" />
          2.º turno
        </span>
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
