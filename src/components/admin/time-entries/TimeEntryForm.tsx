"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SplitSquareHorizontal } from "lucide-react";
import { todayColombia, formatTime, formatHours, formatDate } from "@/lib/utils";
import {
  buildShiftDateTimes,
  buildOvertimeWarning,
  classifyShift,
  flattenEntryShifts,
  sumDailyHours,
  DAILY_ALERT_HOURS,
  MAX_DAILY_HOURS,
  type DailyShift,
  type ShiftRange,
  type OvertimeWarning,
} from "@/lib/shift-times";

interface Employee { id: string; name: string; }

/** Payload de creación/edición de un registro de horas. */
interface EntryPayload {
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut: string | null;
  notes: string | null;
}

/** Lo que se va a guardar, ya validado y pendiente de confirmación. */
interface PreparedSave {
  turno1: EntryPayload;
  turno2: EntryPayload | null;
}

interface TimeEntryFormProps {
  employees: Employee[];
  entry?: {
    id: string;
    employeeId: string;
    date: string;
    checkIn: string;
    checkOut: string | null;
    notes: string | null;
    isSpecial: boolean;
  };
}

export function TimeEntryForm({ employees, entry }: TimeEntryFormProps) {
  const router = useRouter();
  const isEdit = !!entry;

  const toTimeString = (isoStr: string) => {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const [form, setForm] = useState({
    employeeId: entry?.employeeId ?? (employees[0]?.id ?? ""),
    date: entry?.date ?? todayColombia(),
    checkIn: entry ? toTimeString(entry.checkIn) : "",
    checkOut: entry?.checkOut ? toTimeString(entry.checkOut) : "",
    checkIn2: "",
    checkOut2: "",
    notes: entry?.notes ?? "",
  });

  const [splitShift, setSplitShift] = useState(false);
  const [loading, setLoading] = useState(false);

  // Turnos ya guardados para este empleado y fecha (excluye el que se edita).
  // Son el contexto del aviso de jornada: sin ellos no sabríamos que el turno
  // que se está registrando es el segundo del día.
  const [savedDayShifts, setSavedDayShifts] = useState<ShiftRange[]>([]);
  const [pending, setPending] = useState<{ save: PreparedSave; warning: OvertimeWarning } | null>(null);

  useEffect(() => {
    // Sin empleado o sin fecha no hay nada que consultar; el formulario no se
    // puede enviar en ese estado (ambos campos son obligatorios).
    if (!form.employeeId || !form.date) return;
    let cancelled = false;
    const params = new URLSearchParams({
      from: form.date,
      to: form.date,
      employeeId: form.employeeId,
    });
    fetch(`/api/admin/time-entries?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: { id: string; checkIn: string; checkOut: string | null; checkIn2: string | null; checkOut2: string | null }[]) => {
        if (cancelled) return;
        setSavedDayShifts(
          data
            .filter((e) => e.id !== entry?.id)
            .flatMap((e) =>
              flattenEntryShifts({
                checkIn: new Date(e.checkIn),
                checkOut: e.checkOut ? new Date(e.checkOut) : null,
                checkIn2: e.checkIn2 ? new Date(e.checkIn2) : null,
                checkOut2: e.checkOut2 ? new Date(e.checkOut2) : null,
              })
            )
        );
      })
      .catch(() => {
        // Sin permiso de lectura o error de red: el aviso se calcula solo con
        // lo del formulario y el servidor sigue validando el tope diario.
        if (!cancelled) setSavedDayShifts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.employeeId, form.date, entry?.id]);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const special = form.date ? new Date(form.date + "T12:00:00Z").getUTCDay() === 0 : false;

  const employeeName =
    employees.find((emp) => emp.id === form.employeeId)?.name ?? "El empleado";

  // Pistas "+1 día": la salida cae en la madrugada del día siguiente.
  const checkOutNextDay =
    !!form.checkIn && !!form.checkOut &&
    classifyShift(form.checkIn, form.checkOut) === "overnight";
  const checkOut2NextDay =
    splitShift && !!form.checkIn2 && !!form.checkOut2 &&
    classifyShift(form.checkIn2, form.checkOut2) === "overnight";

  async function postEntry(payload: object): Promise<{ ok: boolean; error?: string }> {
    const url = isEdit ? `/api/admin/time-entries/${entry!.id}` : "/api/admin/time-entries";
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: typeof data.error === "string" ? data.error : "Error al guardar" };
    }
    return { ok: true };
  }

  /**
   * Valida lo ingresado y devuelve los payloads listos para guardar, o `null`
   * si algo no cuadra (ya avisado por toast).
   */
  function prepareSave(): PreparedSave | null {
    const shift1 = buildShiftDateTimes(form.date, form.checkIn, form.checkOut);
    if (!shift1.ok) {
      toast.error(shift1.error);
      return null;
    }

    const isSplit = !isEdit && splitShift && !!form.checkIn2;
    const shift2 = isSplit
      ? buildShiftDateTimes(form.date, form.checkIn2, form.checkOut2)
      : null;
    if (shift2 && !shift2.ok) {
      toast.error(`Turno 2: ${shift2.error}`);
      return null;
    }

    // Pre-chequeo del tope diario con lo ingresado en el formulario. El
    // servidor hace la validación autoritativa incluyendo turnos ya guardados.
    const dailyEntries: DailyShift[] = [
      {
        checkIn: new Date(shift1.checkIn),
        checkOut: shift1.checkOut ? new Date(shift1.checkOut) : null,
        checkIn2: null,
        checkOut2: null,
      },
    ];
    if (shift2 && shift2.ok) {
      dailyEntries.push({
        checkIn: new Date(shift2.checkIn),
        checkOut: shift2.checkOut ? new Date(shift2.checkOut) : null,
        checkIn2: null,
        checkOut2: null,
      });
    }
    if (sumDailyHours(dailyEntries) > MAX_DAILY_HOURS) {
      toast.error(
        `El total de horas del día para este empleado supera el máximo de ${MAX_DAILY_HOURS} h.`
      );
      return null;
    }

    return {
      turno1: {
        employeeId: form.employeeId,
        date: form.date,
        checkIn: shift1.checkIn,
        checkOut: shift1.checkOut,
        notes: form.notes || null,
      },
      turno2:
        shift2 && shift2.ok
          ? {
              employeeId: form.employeeId,
              date: form.date,
              checkIn: shift2.checkIn,
              checkOut: shift2.checkOut,
              notes: null,
            }
          : null,
    };
  }

  async function save({ turno1, turno2 }: PreparedSave) {
    setLoading(true);

    if (isEdit) {
      const result = await postEntry(turno1);
      setLoading(false);
      if (result.ok) {
        toast.success("Registro actualizado");
        router.push("/admin/time-entries");
        router.refresh();
      } else {
        toast.error(result.error ?? "Error al actualizar");
      }
      return;
    }

    // CREATE — puede ser 1 o 2 registros
    const result1 = await postEntry(turno1);
    if (!result1.ok) {
      setLoading(false);
      toast.error(result1.error ?? "Error al guardar el turno 1");
      return;
    }

    if (turno2) {
      const result2 = await postEntry(turno2);
      if (!result2.ok) {
        setLoading(false);
        toast.warning(`Turno 1 guardado, pero falló el turno 2: ${result2.error ?? "error desconocido"}`);
        router.push("/admin/time-entries");
        router.refresh();
        return;
      }
      toast.success("Turno partido registrado (2 registros)");
    } else {
      toast.success("Horas registradas");
    }

    setLoading(false);
    router.push("/admin/time-entries");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const prepared = prepareSave();
    if (!prepared) return;

    const pendingRanges: ShiftRange[] = [
      { checkIn: new Date(prepared.turno1.checkIn), checkOut: prepared.turno1.checkOut ? new Date(prepared.turno1.checkOut) : null },
      ...(prepared.turno2
        ? [{ checkIn: new Date(prepared.turno2.checkIn), checkOut: prepared.turno2.checkOut ? new Date(prepared.turno2.checkOut) : null }]
        : []),
    ];

    const warning = buildOvertimeWarning(savedDayShifts, pendingRanges);
    if (warning) {
      setPending({ save: prepared, warning });
      return;
    }

    await save(prepared);
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Empleado */}
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Personal *</Label>
          <SearchableSelect
            value={form.employeeId}
            onValueChange={(v) => set("employeeId", v)}
            placeholder="Buscar personal…"
            options={employees.map((emp) => ({ value: emp.id, label: emp.name }))}
          />
        </div>

        {/* Fecha */}
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Fecha *</Label>
          <div className="flex items-center gap-3">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              required
              className="flex-1"
            />
            {special && (
              <Badge className="border-0 whitespace-nowrap bg-[#C1643F]/10 text-[#C1643F]">
                Domingo / Festivo
              </Badge>
            )}
          </div>
        </div>

        {/* Turno 1 */}
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold text-[#7A6358] uppercase tracking-wider mb-2">
            {!isEdit && splitShift ? "Turno 1" : "Horario"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Entrada *</Label>
              <Input
                type="time"
                value={form.checkIn}
                onChange={(e) => set("checkIn", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label>Salida</Label>
                {checkOutNextDay && (
                  <Badge className="border-0 whitespace-nowrap bg-[#C1643F]/10 text-[#C1643F]">
                    +1 día
                  </Badge>
                )}
              </div>
              <Input
                type="time"
                value={form.checkOut}
                onChange={(e) => set("checkOut", e.target.value)}
              />
              <p className="text-xs text-[#7A6358]">
                Vacío = solo entrada · cruza medianoche hasta 2:00 AM
              </p>
            </div>
          </div>
        </div>

        {/* Toggle turno partido — solo en CREATE */}
        {!isEdit && (
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => {
                setSplitShift((v) => !v);
                if (splitShift) { set("checkIn2", ""); set("checkOut2", ""); }
              }}
              className="flex items-center gap-2 text-sm font-medium transition-colors"
              style={{ color: splitShift ? "#C1643F" : "#7A6358" }}
            >
              <SplitSquareHorizontal className="w-4 h-4" />
              {splitShift ? "Quitar turno partido" : "Agregar turno partido (2.º turno)"}
            </button>
          </div>
        )}

        {/* Turno 2 — solo en CREATE con split */}
        {!isEdit && splitShift && (
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold text-[#7A6358] uppercase tracking-wider mb-2">Turno 2</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Entrada 2 *</Label>
                <Input
                  type="time"
                  value={form.checkIn2}
                  onChange={(e) => set("checkIn2", e.target.value)}
                  required={splitShift}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label>Salida 2</Label>
                  {checkOut2NextDay && (
                    <Badge className="border-0 whitespace-nowrap bg-[#C1643F]/10 text-[#C1643F]">
                      +1 día
                    </Badge>
                  )}
                </div>
                <Input
                  type="time"
                  value={form.checkOut2}
                  onChange={(e) => set("checkOut2", e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-[#7A6358] mt-1">
              Se guardará como un segundo registro independiente para este empleado y fecha.
            </p>
          </div>
        )}

        {/* Notas */}
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Notas</Label>
          <Input
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Ej: Llegó tarde 15 min"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={loading}
          className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]"
        >
          {loading
            ? "Guardando..."
            : isEdit
              ? "Actualizar registro"
              : splitShift
                ? "Registrar ambos turnos"
                : "Registrar horas"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/time-entries")}
          className="border-[#E0D5CA]"
        >
          Cancelar
        </Button>
      </div>
    </form>

    {pending && (
      <ConfirmDialog
        open
        variant="warning"
        title={`Supera las ${DAILY_ALERT_HOURS} horas del día`}
        description={`${employeeName} quedaría con ${formatHours(pending.warning.totalHours)} el ${formatDate(form.date)}.`}
        details={<OvertimeDetails warning={pending.warning} />}
        confirmLabel={
          pending.warning.kind === "split" ? "Sí, registrar el turno" : "Sí, registrar"
        }
        cancelLabel="Revisar"
        onConfirm={() => {
          const { save: prepared } = pending;
          setPending(null);
          void save(prepared);
        }}
        onCancel={() => setPending(null)}
      />
    )}
    </>
  );
}

/**
 * Contexto del aviso: los turnos del día en orden cronológico (Turno 1 = el más
 * temprano) con el que se está registrando desglosado en entrada y salida.
 */
function OvertimeDetails({ warning }: { warning: OvertimeWarning }) {
  const { shifts, pendingIndex, kind } = warning;
  const pendingShift = shifts[pendingIndex];

  const row = (label: string, value: string) => (
    <div key={label} className="flex items-baseline justify-between gap-3">
      <span className="text-[#7A6358]">{label}</span>
      <span className="font-mono text-[#2C1F15]">{value}</span>
    </div>
  );

  return (
    <div className="space-y-1.5 rounded-lg border border-[#E0D5CA] bg-[#F2EDE6] p-3 text-xs">
      {kind === "single" ? (
        <>
          {row("Entrada registrada", formatTime(pendingShift.checkIn))}
          {row(
            "Salida que se registra",
            pendingShift.checkOut ? formatTime(pendingShift.checkOut) : "—"
          )}
        </>
      ) : (
        shifts.map((shift, i) =>
          i === pendingIndex ? (
            <div key={i} className="space-y-1.5">
              {row(`Turno ${i + 1} — entrada`, formatTime(shift.checkIn))}
              {shift.checkOut && row(`Turno ${i + 1} — salida`, formatTime(shift.checkOut))}
            </div>
          ) : (
            <div key={i}>
              {row(
                `Turno ${i + 1}`,
                `${formatTime(shift.checkIn)} → ${shift.checkOut ? formatTime(shift.checkOut) : "pendiente"}`
              )}
            </div>
          )
        )
      )}
    </div>
  );
}
