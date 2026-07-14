"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CalendarDays, Repeat, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

export interface CustomHoliday {
  id: string;
  name: string;
  month: number;
  day: number;
  year: number | null;
}

export interface NationalHolidayDTO {
  date: string; // "YYYY-MM-DD"
  name: string;
}

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatDayMonth(day: number, month: number): string {
  return `${day} de ${MONTHS[month - 1] ?? "?"}`;
}

interface Props {
  initialHolidays: CustomHoliday[];
  national: { year: number; holidays: NationalHolidayDTO[] }[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

type FormState = {
  id: string | null;
  name: string;
  month: number;
  day: number;
  recurring: boolean;
  year: number;
};

const CURRENT_YEAR = new Date().getFullYear();

export function HolidaysManager({ initialHolidays, national, canCreate, canEdit, canDelete }: Props) {
  const router = useRouter();
  const [holidays] = useState(initialHolidays);
  const [nationalYear, setNationalYear] = useState(national[0]?.year ?? CURRENT_YEAR);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<CustomHoliday | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setForm({ id: null, name: "", month: 1, day: 1, recurring: false, year: CURRENT_YEAR });
  }

  function openEdit(h: CustomHoliday) {
    setForm({
      id: h.id,
      name: h.name,
      month: h.month,
      day: h.day,
      recurring: h.year === null,
      year: h.year ?? CURRENT_YEAR,
    });
  }

  async function save() {
    if (!form) return;
    if (form.name.trim().length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      month: form.month,
      day: form.day,
      year: form.recurring ? null : form.year,
    };
    const url = form.id ? `/api/admin/holidays/${form.id}` : "/api/admin/holidays";
    const res = await fetch(url, {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const n = typeof data.recalculated === "number" ? data.recalculated : 0;
      toast.success(
        form.id
          ? `Festivo actualizado${n ? ` · ${n} turno(s) recalculado(s)` : ""}`
          : `Festivo registrado${n ? ` · ${n} turno(s) recalculado(s)` : ""}`
      );
      setForm(null);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "No se pudo guardar el festivo");
    }
  }

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/holidays/${toDelete.id}`, { method: "DELETE" });
    setDeleting(false);
    setToDelete(null);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const n = typeof data.recalculated === "number" ? data.recalculated : 0;
      toast.success(`Festivo eliminado${n ? ` · ${n} turno(s) recalculado(s)` : ""}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "No se pudo eliminar");
    }
  }

  const currentNational = national.find((n) => n.year === nationalYear)?.holidays ?? [];

  return (
    <div className="space-y-8">
      {/* Festivos personalizados */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-heading font-semibold text-[#2C1F15]">Festivos personalizados</h2>
            <p className="text-sm text-[#7A6358] mt-0.5">
              Festivos decretados localmente que la librería nacional no incluye. El sistema los paga
              como día especial y recalcula los turnos ya registrados.
            </p>
          </div>
          {canCreate && (
            <Button onClick={openCreate} className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-2">
              <Plus className="w-4 h-4" /> Nuevo festivo
            </Button>
          )}
        </div>

        <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-[#E0D5CA] bg-[#C1643F]/8">
                <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Festivo</th>
                <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Vigencia</th>
                <th className="text-right px-4 py-3 font-semibold text-[#2C1F15]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h, i) => (
                <tr
                  key={h.id}
                  className={`border-b border-[#F2EDE6] last:border-0 ${i % 2 === 1 ? "bg-[#F2EDE6]/50" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-[#2C1F15]">{h.name}</td>
                  <td className="px-4 py-3 text-[#7A6358] font-mono">{formatDayMonth(h.day, h.month)}</td>
                  <td className="px-4 py-3">
                    {h.year === null ? (
                      <Badge className="bg-[#6B8E6B]/15 text-[#4a6b4a] border-0 gap-1">
                        <Repeat className="w-3 h-3" /> Cada año
                      </Badge>
                    ) : (
                      <Badge className="bg-[#8B6355]/12 text-[#8B6355] border-0">{h.year}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <button
                          onClick={() => openEdit(h)}
                          className="p-1.5 rounded hover:bg-[#F2EDE6] text-[#7A6358]"
                          aria-label="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setToDelete(h)}
                          className="p-1.5 rounded hover:bg-red-50 text-[#B94040]"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {holidays.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-[#7A6358]">
                    No hay festivos personalizados.
                    {canCreate && (
                      <>
                        {" "}
                        <button onClick={openCreate} className="text-[#C1643F] hover:underline">
                          Crear el primero
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Festivos nacionales (solo lectura) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-heading font-semibold text-[#2C1F15] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#7A6358]" /> Festivos nacionales
            </h2>
            <p className="text-sm text-[#7A6358] mt-0.5">
              Fijados por la Ley Emiliani. Se aplican automáticamente y no son editables.
            </p>
          </div>
          <div className="w-32">
            <Select value={String(nationalYear)} onValueChange={(v) => setNationalYear(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {national.map((n) => (
                  <SelectItem key={n.year} value={String(n.year)}>
                    {n.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <tbody>
              {currentNational.map((h, i) => (
                <tr
                  key={h.date}
                  className={`border-b border-[#F2EDE6] last:border-0 ${i % 2 === 1 ? "bg-[#F2EDE6]/50" : ""}`}
                >
                  <td className="px-4 py-2.5 w-32 text-[#7A6358] font-mono">{h.date}</td>
                  <td className="px-4 py-2.5 text-[#2C1F15]">{h.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Formulario crear/editar */}
      <Dialog open={form !== null} onOpenChange={(v) => { if (!v) setForm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#2C1F15] flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[#C1643F]" />
              {form?.id ? "Editar festivo" : "Nuevo festivo"}
            </DialogTitle>
            <DialogDescription className="text-[#7A6358]">
              El sistema pagará este día como especial y recalculará los turnos ya registrados en él.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="hol-name">Nombre</Label>
                <Input
                  id="hol-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ntra. Sra. del Rosario de Chiquinquirá"
                  maxLength={80}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Mes</Label>
                  <Select
                    value={String(form.month)}
                    onValueChange={(v) => setForm({ ...form, month: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, idx) => (
                        <SelectItem key={m} value={String(idx + 1)}>
                          {m.charAt(0).toUpperCase() + m.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hol-day">Día</Label>
                  <Input
                    id="hol-day"
                    type="number"
                    min={1}
                    max={31}
                    value={form.day}
                    onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Vigencia</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, recurring: false })}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                      !form.recurring
                        ? "border-[#C1643F] bg-[#C1643F]/8 text-[#2C1F15] font-medium"
                        : "border-[#E0D5CA] text-[#7A6358] hover:bg-[#F2EDE6]"
                    }`}
                  >
                    Solo un año
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, recurring: true })}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                      form.recurring
                        ? "border-[#C1643F] bg-[#C1643F]/8 text-[#2C1F15] font-medium"
                        : "border-[#E0D5CA] text-[#7A6358] hover:bg-[#F2EDE6]"
                    }`}
                  >
                    Cada año
                  </button>
                </div>
                {!form.recurring && (
                  <Input
                    type="number"
                    min={2000}
                    max={2100}
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                    className="mt-1"
                  />
                )}
                <p className="text-xs text-[#7A6358]">
                  {form.recurring
                    ? "Se repetirá ese día y mes todos los años (ej. fiesta patronal fija)."
                    : "Aplica solo al año indicado (ej. decreto puntual de este año)."}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-row justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setForm(null)}
              className="border-[#E0D5CA] text-[#7A6358] hover:bg-[#F2EDE6]"
            >
              Cancelar
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]"
            >
              {saving ? "Guardando…" : form?.id ? "Guardar cambios" : "Registrar festivo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar festivo"
        description={
          toDelete
            ? `¿Eliminar "${toDelete.name}"? Los turnos de esa fecha dejarán de pagarse como especiales (salvo que sean domingo o festivo nacional).`
            : ""
        }
        confirmLabel={deleting ? "Eliminando…" : "Eliminar"}
        variant="danger"
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
