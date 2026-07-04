"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import {
  Gift,
  Plus,
  Pencil,
  Trash2,
  X,
  Power,
  Info,
} from "lucide-react";
import {
  FREQUENCY_LABELS,
  MONTHLY_MODE_LABELS,
  ASSIGNMENT_TYPE_LABELS,
  type BonusAssignmentType,
  type BonusFrequency,
  type BonusMonthlyMode,
  type BonusValueType,
} from "@/lib/bonuses";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface EmployeeLite {
  id: string;
  name: string;
  payType: string;
  active: boolean;
}

interface AssignmentRow {
  id: string;
  employeeId: string;
  amount: number | null;
  employee: { id: string; name: string };
}

interface BonusRow {
  id: string;
  name: string;
  description: string | null;
  valueType: BonusValueType;
  amount: number;
  assignmentType: BonusAssignmentType;
  frequency: BonusFrequency;
  monthlyMode: BonusMonthlyMode | null;
  active: boolean;
  assignments: AssignmentRow[];
}

interface BonusManagerProps {
  employees: EmployeeLite[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 9);
}
function displayThousands(raw: string): string {
  if (!raw) return "";
  return Number(raw).toLocaleString("es-CO");
}

export function BonusManager({ employees, canCreate, canEdit, canDelete }: BonusManagerProps) {
  const [open, setOpen] = useState(false);
  const [bonuses, setBonuses] = useState<BonusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<BonusRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmBonus, setConfirmBonus] = useState<BonusRow | null>(null);

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);

  const fetchBonuses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bonuses");
      if (!res.ok) throw new Error();
      setBonuses(await res.json());
    } catch {
      toast.error("Error al cargar bonos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchBonuses();
  }, [open, fetchBonuses]);

  async function toggleActive(b: BonusRow) {
    const res = await fetch(`/api/admin/bonuses/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !b.active }),
    });
    if (res.ok) {
      toast.success(b.active ? "Bono desactivado" : "Bono activado");
      fetchBonuses();
    } else {
      toast.error("Error al cambiar el estado");
    }
  }

  async function deleteBonus() {
    if (!confirmBonus) return;
    const res = await fetch(`/api/admin/bonuses/${confirmBonus.id}`, { method: "DELETE" });
    setConfirmBonus(null);
    if (res.ok) {
      toast.success("Bono eliminado");
      fetchBonuses();
    } else {
      toast.error("Error al eliminar");
    }
  }

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(b: BonusRow) {
    setEditing(b);
    setShowForm(true);
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2 border-[#C1643F] text-[#C1643F] hover:bg-[#C1643F]/10"
      >
        <Gift className="w-4 h-4" /> Gestionar bonos
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/40 sm:p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white w-full sm:max-w-3xl sm:rounded-xl border border-[#E0D5CA] shadow-xl flex flex-col max-h-screen sm:max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E0D5CA]">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-[#C1643F]" />
                <h2 className="text-lg font-heading font-bold text-[#2C1F15]">Gestión de bonos</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#7A6358] hover:text-[#2C1F15]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {showForm ? (
                <BonusForm
                  editing={editing}
                  employees={activeEmployees}
                  onCancel={() => setShowForm(false)}
                  onSaved={() => {
                    setShowForm(false);
                    fetchBonuses();
                  }}
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-[#7A6358]">
                      {bonuses.length} bono{bonuses.length !== 1 ? "s" : ""} configurado{bonuses.length !== 1 ? "s" : ""}
                    </p>
                    {canCreate && (
                      <Button onClick={openCreate} className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-1.5">
                        <Plus className="w-4 h-4" /> Nuevo bono
                      </Button>
                    )}
                  </div>

                  {loading ? (
                    <p className="text-center text-sm text-[#7A6358] py-10">Cargando...</p>
                  ) : bonuses.length === 0 ? (
                    <p className="text-center text-sm text-[#7A6358] py-10">
                      No hay bonos. Crea el primero con &quot;Nuevo bono&quot;.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {bonuses.map((b) => (
                        <BonusCard
                          key={b.id}
                          bonus={b}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          onEdit={() => openEdit(b)}
                          onToggle={() => toggleActive(b)}
                          onDelete={() => setConfirmBonus(b)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmBonus}
        title="Eliminar bono"
        description={confirmBonus ? `¿Eliminar el bono "${confirmBonus.name}"? Esta acción no afecta reportes ya descargados.` : ""}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={deleteBonus}
        onCancel={() => setConfirmBonus(null)}
      />
    </>
  );
}

function BonusCard({
  bonus,
  canEdit,
  canDelete,
  onEdit,
  onToggle,
  onDelete,
}: {
  bonus: BonusRow;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const valueLabel =
    bonus.valueType === "STANDARD"
      ? formatCurrency(bonus.amount)
      : "Valor por empleado";
  const freqLabel =
    bonus.frequency === "MONTHLY" && bonus.monthlyMode
      ? `${FREQUENCY_LABELS.MONTHLY} · ${MONTHLY_MODE_LABELS[bonus.monthlyMode]}`
      : FREQUENCY_LABELS[bonus.frequency];

  return (
    <div className={`rounded-lg border p-3 ${bonus.active ? "border-[#E0D5CA] bg-white" : "border-[#E0D5CA] bg-[#F2EDE6]/40"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[#2C1F15]">{bonus.name}</p>
            <Badge className={bonus.active ? "bg-[#6B8E6B]/15 text-[#6B8E6B] border-0" : "bg-[#7A6358]/10 text-[#7A6358] border-0"}>
              {bonus.active ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          {bonus.description && <p className="text-xs text-[#7A6358] mt-0.5">{bonus.description}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#7A6358] mt-1">
            <span className="font-mono text-[#2C1F15]">{valueLabel}</span>
            <span>· {ASSIGNMENT_TYPE_LABELS[bonus.assignmentType]}</span>
            <span>· {freqLabel}</span>
            {bonus.assignmentType === "SPECIFIC" && (
              <span>· {bonus.assignments.length} empleado{bonus.assignments.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canEdit && (
            <button onClick={onToggle} title={bonus.active ? "Desactivar" : "Activar"}
              className="p-1.5 rounded-md text-[#7A6358] hover:text-[#C1643F] hover:bg-[#F2EDE6]">
              <Power className="w-4 h-4" />
            </button>
          )}
          {canEdit && (
            <button onClick={onEdit} title="Editar"
              className="p-1.5 rounded-md text-[#7A6358] hover:text-[#C1643F] hover:bg-[#F2EDE6]">
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {canDelete && (
            <button onClick={onDelete} title="Eliminar"
              className="p-1.5 rounded-md text-[#7A6358] hover:text-[#B94040] hover:bg-[#F2EDE6]">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BonusForm({
  editing,
  employees,
  onCancel,
  onSaved,
}: {
  editing: BonusRow | null;
  employees: EmployeeLite[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [assignmentType, setAssignmentType] = useState<BonusAssignmentType>(editing?.assignmentType ?? "ALL");
  const [valueType, setValueType] = useState<BonusValueType>(editing?.valueType ?? "STANDARD");
  const [amount, setAmount] = useState<string>(editing && editing.valueType === "STANDARD" ? String(editing.amount) : "");
  const [frequency, setFrequency] = useState<BonusFrequency>(editing?.frequency ?? "BIWEEKLY");
  const [monthlyMode, setMonthlyMode] = useState<BonusMonthlyMode>(editing?.monthlyMode ?? "SPLIT");
  const [active, setActive] = useState(editing?.active ?? true);
  const [saving, setSaving] = useState(false);

  // Membresía para SPECIFIC
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(editing?.assignmentType === "SPECIFIC" ? editing.assignments.map((a) => a.employeeId) : [])
  );
  // Montos individuales para PER_EMPLOYEE (keyed by employeeId, valor en string de dígitos)
  const [perAmounts, setPerAmounts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    if (editing?.valueType === "PER_EMPLOYEE") {
      editing.assignments.forEach((a) => {
        if (a.amount != null) m[a.employeeId] = String(Math.round(a.amount));
      });
    }
    return m;
  });

  // Grupo de empleados visibles según el tipo de asignación
  const groupEmployees = useMemo(() => {
    if (assignmentType === "PAYROLL") return employees.filter((e) => e.payType === "PAYROLL");
    if (assignmentType === "SHIFT") return employees.filter((e) => e.payType === "SHIFT");
    return employees; // ALL o SPECIFIC
  }, [assignmentType, employees]);

  const showSpecificPicker = assignmentType === "SPECIFIC";
  const showPerEmployeeAmounts = valueType === "PER_EMPLOYEE";

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildAssignments(): { employeeId: string; amount?: number }[] {
    if (valueType === "PER_EMPLOYEE") {
      // Empleados objetivo: SPECIFIC -> seleccionados; otro -> grupo
      const targets = showSpecificPicker
        ? groupEmployees.filter((e) => selectedIds.has(e.id))
        : groupEmployees;
      return targets
        .map((e) => ({ employeeId: e.id, amount: Number(perAmounts[e.id] || 0) }))
        .filter((a) => a.amount > 0);
    }
    // STANDARD
    if (showSpecificPicker) {
      return groupEmployees.filter((e) => selectedIds.has(e.id)).map((e) => ({ employeeId: e.id }));
    }
    return [];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name,
      description: description || null,
      valueType,
      amount: valueType === "STANDARD" ? Number(amount || 0) : undefined,
      assignmentType,
      frequency,
      monthlyMode: frequency === "MONTHLY" ? monthlyMode : null,
      active,
      assignments: buildAssignments(),
    };

    setSaving(true);
    try {
      const url = editing ? `/api/admin/bonuses/${editing.id}` : "/api/admin/bonuses";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          data?.error?.message ??
          data?.error?.formErrors?.[0] ??
          (data?.error?.fieldErrors ? "Revisa los campos del formulario" : "Error al guardar el bono");
        toast.error(msg);
        return;
      }
      toast.success(editing ? "Bono actualizado" : "Bono creado");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-bold text-[#2C1F15]">
          {editing ? "Editar bono" : "Nuevo bono"}
        </h3>
        <button type="button" onClick={onCancel} className="text-sm text-[#7A6358] hover:text-[#2C1F15] underline">
          Volver a la lista
        </button>
      </div>

      {/* 1 + 2: Nombre y descripción */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nombre del bono *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Ej: Bono de alimentación" />
        </div>
        <div className="space-y-1.5">
          <Label>Descripción (opcional)</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Subsidio mensual" />
        </div>
      </div>

      {/* 4: Aplica a */}
      <div className="space-y-1.5">
        <Label>Aplica a</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(["ALL", "PAYROLL", "SHIFT", "SPECIFIC"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAssignmentType(t)}
              className={`py-2 px-2 rounded-md text-xs font-medium border transition-colors ${
                assignmentType === t
                  ? "bg-[#C1643F] text-white border-[#C1643F]"
                  : "bg-white text-[#7A6358] border-[#E0D5CA] hover:bg-[#F2EDE6]"
              }`}
            >
              {ASSIGNMENT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* 5: Tipo de valor */}
      <div className="space-y-1.5">
        <Label>Tipo de valor</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["STANDARD", "PER_EMPLOYEE"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setValueType(t)}
              className={`py-2 px-2 rounded-md text-xs font-medium border transition-colors ${
                valueType === t
                  ? "bg-[#8B6355] text-white border-[#8B6355]"
                  : "bg-white text-[#7A6358] border-[#E0D5CA] hover:bg-[#F2EDE6]"
              }`}
            >
              {t === "STANDARD" ? "Valor estándar (igual para todos)" : "Valor personalizado por empleado"}
            </button>
          ))}
        </div>
      </div>

      {/* 3: Valor estándar */}
      {valueType === "STANDARD" && (
        <div className="space-y-1.5">
          <Label>Valor del bono (COP) *</Label>
          <Input
            type="text"
            inputMode="numeric"
            value={displayThousands(amount)}
            onChange={(e) => setAmount(digitsOnly(e.target.value))}
            placeholder="50.000"
            required
          />
        </div>
      )}

      {/* Selector de empleados específicos */}
      {showSpecificPicker && (
        <div className="space-y-1.5">
          <Label>Personal {valueType === "PER_EMPLOYEE" ? "y su valor" : "asignado"}</Label>
          <div className="border border-[#E0D5CA] rounded-md divide-y divide-[#F2EDE6] max-h-56 overflow-y-auto">
            {groupEmployees.length === 0 && (
              <p className="text-xs text-[#7A6358] p-3">No hay personal activo.</p>
            )}
            {groupEmployees.map((e) => (
              <label key={e.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-[#FAF7F2]">
                <input
                  type="checkbox"
                  checked={selectedIds.has(e.id)}
                  onChange={() => toggleSelected(e.id)}
                  className="accent-[#C1643F]"
                />
                <span className="flex-1 text-sm text-[#2C1F15]">{e.name}</span>
                <Badge className="bg-[#F2EDE6] text-[#7A6358] border-0 text-[10px]">
                  {e.payType === "SHIFT" ? "Turnos" : "Nómina"}
                </Badge>
                {valueType === "PER_EMPLOYEE" && selectedIds.has(e.id) && (
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={displayThousands(perAmounts[e.id] ?? "")}
                    onChange={(ev) => setPerAmounts((p) => ({ ...p, [e.id]: digitsOnly(ev.target.value) }))}
                    placeholder="Valor"
                    className="w-28 h-8 text-sm"
                    onClick={(ev) => ev.preventDefault()}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Montos por empleado para grupos (ALL/PAYROLL/SHIFT) + PER_EMPLOYEE */}
      {!showSpecificPicker && showPerEmployeeAmounts && (
        <div className="space-y-1.5">
          <Label>Valor por empleado (COP)</Label>
          <p className="text-xs text-[#7A6358]">Deja en blanco los empleados que no reciben este bono.</p>
          <div className="border border-[#E0D5CA] rounded-md divide-y divide-[#F2EDE6] max-h-56 overflow-y-auto">
            {groupEmployees.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-2.5">
                <span className="flex-1 text-sm text-[#2C1F15]">{e.name}</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={displayThousands(perAmounts[e.id] ?? "")}
                  onChange={(ev) => setPerAmounts((p) => ({ ...p, [e.id]: digitsOnly(ev.target.value) }))}
                  placeholder="Valor"
                  className="w-32 h-8 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6: Frecuencia */}
      <div className="space-y-1.5">
        <Label>Frecuencia de pago</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["BIWEEKLY", "MONTHLY"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={`py-2 px-2 rounded-md text-sm font-medium border transition-colors ${
                frequency === f
                  ? "bg-[#C1643F] text-white border-[#C1643F]"
                  : "bg-white text-[#7A6358] border-[#E0D5CA] hover:bg-[#F2EDE6]"
              }`}
            >
              {FREQUENCY_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* 7: Modo mensual */}
      {frequency === "MONTHLY" && (
        <div className="space-y-1.5">
          <Label>¿Cómo se paga este bono mensual?</Label>
          <div className="space-y-2">
            {(["FIRST", "SECOND", "SPLIT"] as const).map((m) => (
              <label
                key={m}
                className={`flex items-center gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                  monthlyMode === m ? "border-[#C1643F] bg-[#C1643F]/5" : "border-[#E0D5CA] hover:bg-[#F2EDE6]"
                }`}
              >
                <input type="radio" name="monthlyMode" checked={monthlyMode === m} onChange={() => setMonthlyMode(m)} className="accent-[#C1643F]" />
                <span className="text-sm text-[#2C1F15]">{MONTHLY_MODE_LABELS[m]}</span>
              </label>
            ))}
          </div>
          {monthlyMode === "SPLIT" && (
            <div className="flex items-start gap-2 text-xs text-[#7A6358] bg-[#F2EDE6] rounded-md p-3">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#C1643F]" />
              <span>
                Este bono se dividirá automáticamente en dos pagos: 50% en la primera quincena y 50% en la
                segunda quincena del mes.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Estado */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[#C1643F]" />
        <span className="text-sm text-[#2C1F15]">Bono activo (se aplica a los cálculos de pago)</span>
      </label>

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2 border-t border-[#F2EDE6]">
        <Button type="button" variant="outline" onClick={onCancel} className="border-[#E0D5CA] w-full sm:w-auto">
          Cancelar
        </Button>
        <Button type="submit" disabled={saving} className="bg-[#C1643F] hover:bg-[#A8522F] text-white w-full sm:flex-1">
          {saving ? "Guardando..." : editing ? "Actualizar bono" : "Crear bono"}
        </Button>
      </div>
    </form>
  );
}
