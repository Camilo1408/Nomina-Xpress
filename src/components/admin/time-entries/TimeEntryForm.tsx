"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SplitSquareHorizontal } from "lucide-react";
import { todayColombia } from "@/lib/utils";

interface Employee { id: string; name: string; }

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

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const special = form.date ? new Date(form.date + "T12:00:00Z").getUTCDay() === 0 : false;

  const buildDateTime = (date: string, time: string) => {
    if (!time) return null;
    const [h, m] = time.split(":").map(Number);
    const d = new Date(date + "T00:00:00");
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (form.checkOut && form.checkOut <= form.checkIn) {
      toast.error("La hora de salida debe ser posterior a la hora de entrada.");
      return;
    }
    if (splitShift && form.checkIn2 && form.checkOut2 && form.checkOut2 <= form.checkIn2) {
      toast.error("La hora de salida del turno 2 debe ser posterior a su hora de entrada.");
      return;
    }

    setLoading(true);

    const turno1 = {
      employeeId: form.employeeId,
      date: form.date,
      checkIn: buildDateTime(form.date, form.checkIn),
      checkOut: form.checkOut ? buildDateTime(form.date, form.checkOut) : null,
      notes: form.notes || null,
    };

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

    if (splitShift && form.checkIn2) {
      const turno2 = {
        employeeId: form.employeeId,
        date: form.date,
        checkIn: buildDateTime(form.date, form.checkIn2),
        checkOut: form.checkOut2 ? buildDateTime(form.date, form.checkOut2) : null,
        notes: null,
      };
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Empleado */}
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Empleado *</Label>
          <select
            value={form.employeeId}
            onChange={(e) => set("employeeId", e.target.value)}
            required
            className="w-full border border-[#E0D5CA] rounded-md px-3 py-2 text-sm text-[#2C1F15] bg-white focus:outline-none focus:ring-2 focus:ring-[#C1643F]/30"
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
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
          <div className="grid grid-cols-2 gap-4">
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
              <Label>Salida</Label>
              <Input
                type="time"
                value={form.checkOut}
                onChange={(e) => set("checkOut", e.target.value)}
              />
              <p className="text-xs text-[#7A6358]">Vacío = solo entrada</p>
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
            <div className="grid grid-cols-2 gap-4">
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
                <Label>Salida 2</Label>
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
  );
}
