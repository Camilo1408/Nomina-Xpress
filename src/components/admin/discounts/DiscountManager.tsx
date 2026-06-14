"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { TrendingDown, Plus, Pencil, Trash2, X, Power, Info } from "lucide-react";
import {
  FREQUENCY_LABELS,
  MONTHLY_MODE_LABELS,
  ASSIGNMENT_TYPE_LABELS,
  type DiscountAssignmentType,
  type DiscountFrequency,
  type DiscountMonthlyMode,
  type DiscountValueType,
} from "@/lib/discounts";

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

interface DiscountRow {
  id: string;
  name: string;
  description: string | null;
  valueType: DiscountValueType;
  amount: number;
  assignmentType: DiscountAssignmentType;
  frequency: DiscountFrequency;
  monthlyMode: DiscountMonthlyMode | null;
  active: boolean;
  assignments: AssignmentRow[];
}

interface DiscountManagerProps {
  employees: EmployeeLite[];
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 9);
}
function displayThousands(raw: string): string {
  if (!raw) return "";
  return Number(raw).toLocaleString("es-CO");
}

export function DiscountManager({ employees }: DiscountManagerProps) {
  const [open, setOpen] = useState(false);
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<DiscountRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);

  const fetchDiscounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/discounts");
      if (!res.ok) throw new Error();
      setDiscounts(await res.json());
    } catch {
      toast.error("Error al cargar descuentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchDiscounts();
  }, [open, fetchDiscounts]);

  async function toggleActive(d: DiscountRow) {
    const res = await fetch(`/api/admin/discounts/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !d.active }),
    });
    if (res.ok) {
      toast.success(d.active ? "Descuento desactivado" : "Descuento activado");
      fetchDiscounts();
    } else {
      toast.error("Error al cambiar el estado");
    }
  }

  async function deleteDiscount(d: DiscountRow) {
    if (!confirm(`¿Eliminar el descuento "${d.name}"? Esta acción no afecta reportes ya descargados.`)) return;
    const res = await fetch(`/api/admin/discounts/${d.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Descuento eliminado");
      fetchDiscounts();
    } else {
      toast.error("Error al eliminar");
    }
  }

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(d: DiscountRow) {
    setEditing(d);
    setShowForm(true);
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2 border-[#B94040] text-[#B94040] hover:bg-[#B94040]/10"
      >
        <TrendingDown className="w-4 h-4" /> Gestionar descuentos
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/40 sm:p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white w-full sm:max-w-3xl sm:rounded-xl border border-[#E0D5CA] shadow-xl flex flex-col max-h-screen sm:max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E0D5CA]">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-[#B94040]" />
                <h2 className="text-lg font-heading font-bold text-[#2C1F15]">Gestión de descuentos</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#7A6358] hover:text-[#2C1F15]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {showForm ? (
                <DiscountForm
                  editing={editing}
                  employees={activeEmployees}
                  onCancel={() => setShowForm(false)}
                  onSaved={() => {
                    setShowForm(false);
                    fetchDiscounts();
                  }}
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-[#7A6358]">
                      {discounts.length} descuento{discounts.length !== 1 ? "s" : ""} configurado{discounts.length !== 1 ? "s" : ""}
                    </p>
                    <Button onClick={openCreate} className="bg-[#B94040] hover:bg-[#9E3636] text-[#FAF7F2] gap-1.5">
                      <Plus className="w-4 h-4" /> Nuevo descuento
                    </Button>
                  </div>

                  {loading ? (
                    <p className="text-center text-sm text-[#7A6358] py-10">Cargando...</p>
                  ) : discounts.length === 0 ? (
                    <p className="text-center text-sm text-[#7A6358] py-10">
                      No hay descuentos. Crea el primero con &quot;Nuevo descuento&quot;.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {discounts.map((d) => (
                        <DiscountCard
                          key={d.id}
                          discount={d}
                          onEdit={() => openEdit(d)}
                          onToggle={() => toggleActive(d)}
                          onDelete={() => deleteDiscount(d)}
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
    </>
  );
}

function DiscountCard({
  discount,
  onEdit,
  onToggle,
  onDelete,
}: {
  discount: DiscountRow;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const valueLabel =
    discount.valueType === "STANDARD" ? formatCurrency(discount.amount) : "Valor por empleado";
  const freqLabel =
    discount.frequency === "MONTHLY" && discount.monthlyMode
      ? `${FREQUENCY_LABELS.MONTHLY} · ${MONTHLY_MODE_LABELS[discount.monthlyMode]}`
      : FREQUENCY_LABELS[discount.frequency];

  return (
    <div className={`rounded-lg border p-3 ${discount.active ? "border-[#E0D5CA] bg-white" : "border-[#E0D5CA] bg-[#F2EDE6]/40"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[#2C1F15]">{discount.name}</p>
            <Badge className={discount.active ? "bg-[#6B8E6B]/15 text-[#6B8E6B] border-0" : "bg-[#7A6358]/10 text-[#7A6358] border-0"}>
              {discount.active ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          {discount.description && <p className="text-xs text-[#7A6358] mt-0.5">{discount.description}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#7A6358] mt-1">
            <span className="font-mono text-[#B94040]">−{valueLabel}</span>
            <span>· {ASSIGNMENT_TYPE_LABELS[discount.assignmentType]}</span>
            <span>· {freqLabel}</span>
            {discount.assignmentType === "SPECIFIC" && (
              <span>· {discount.assignments.length} empleado{discount.assignments.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onToggle} title={discount.active ? "Desactivar" : "Activar"}
            className="p-1.5 rounded-md text-[#7A6358] hover:text-[#B94040] hover:bg-[#F2EDE6]">
            <Power className="w-4 h-4" />
          </button>
          <button onClick={onEdit} title="Editar"
            className="p-1.5 rounded-md text-[#7A6358] hover:text-[#B94040] hover:bg-[#F2EDE6]">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} title="Eliminar"
            className="p-1.5 rounded-md text-[#7A6358] hover:text-[#B94040] hover:bg-[#F2EDE6]">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DiscountForm({
  editing,
  employees,
  onCancel,
  onSaved,
}: {
  editing: DiscountRow | null;
  employees: EmployeeLite[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [assignmentType, setAssignmentType] = useState<DiscountAssignmentType>(editing?.assignmentType ?? "ALL");
  const [valueType, setValueType] = useState<DiscountValueType>(editing?.valueType ?? "STANDARD");
  const [amount, setAmount] = useState<string>(editing && editing.valueType === "STANDARD" ? String(editing.amount) : "");
  const [frequency, setFrequency] = useState<DiscountFrequency>(editing?.frequency ?? "BIWEEKLY");
  const [monthlyMode, setMonthlyMode] = useState<DiscountMonthlyMode>(editing?.monthlyMode ?? "SPLIT");
  const [active, setActive] = useState(editing?.active ?? true);
  const [saving, setSaving] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(editing?.assignmentType === "SPECIFIC" ? editing.assignments.map((a) => a.employeeId) : [])
  );
  const [perAmounts, setPerAmounts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    if (editing?.valueType === "PER_EMPLOYEE") {
      editing.assignments.forEach((a) => {
        if (a.amount != null) m[a.employeeId] = String(Math.round(a.amount));
      });
    }
    return m;
  });

  const groupEmployees = useMemo(() => {
    if (assignmentType === "PAYROLL") return employees.filter((e) => e.payType === "PAYROLL");
    if (assignmentType === "SHIFT") return employees.filter((e) => e.payType === "SHIFT");
    return employees;
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
      const targets = showSpecificPicker
        ? groupEmployees.filter((e) => selectedIds.has(e.id))
        : groupEmployees;
      return targets
        .map((e) => ({ employeeId: e.id, amount: Number(perAmounts[e.id] || 0) }))
        .filter((a) => a.amount > 0);
    }
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
      const url = editing ? `/api/admin/discounts/${editing.id}` : "/api/admin/discounts";
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
          (data?.error?.fieldErrors ? "Revisa los campos del formulario" : "Error al guardar el descuento");
        toast.error(msg);
        return;
      }
      toast.success(editing ? "Descuento actualizado" : "Descuento creado");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-bold text-[#2C1F15]">
          {editing ? "Editar descuento" : "Nuevo descuento"}
        </h3>
        <button type="button" onClick={onCancel} className="text-sm text-[#7A6358] hover:text-[#2C1F15] underline">
          Volver a la lista
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nombre del descuento *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Ej: Préstamo" />
        </div>
        <div className="space-y-1.5">
          <Label>Descripción (opcional)</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Cuota mensual" />
        </div>
      </div>

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
                  ? "bg-[#B94040] text-white border-[#B94040]"
                  : "bg-white text-[#7A6358] border-[#E0D5CA] hover:bg-[#F2EDE6]"
              }`}
            >
              {ASSIGNMENT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

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

      {valueType === "STANDARD" && (
        <div className="space-y-1.5">
          <Label>Valor del descuento (COP) *</Label>
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

      {showSpecificPicker && (
        <div className="space-y-1.5">
          <Label>Empleados {valueType === "PER_EMPLOYEE" ? "y su valor" : "asignados"}</Label>
          <div className="border border-[#E0D5CA] rounded-md divide-y divide-[#F2EDE6] max-h-56 overflow-y-auto">
            {groupEmployees.length === 0 && (
              <p className="text-xs text-[#7A6358] p-3">No hay empleados activos.</p>
            )}
            {groupEmployees.map((e) => (
              <label key={e.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-[#FAF7F2]">
                <input
                  type="checkbox"
                  checked={selectedIds.has(e.id)}
                  onChange={() => toggleSelected(e.id)}
                  className="accent-[#B94040]"
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

      {!showSpecificPicker && showPerEmployeeAmounts && (
        <div className="space-y-1.5">
          <Label>Valor por empleado (COP)</Label>
          <p className="text-xs text-[#7A6358]">Deja en blanco los empleados que no reciben este descuento.</p>
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

      <div className="space-y-1.5">
        <Label>Frecuencia de aplicación</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["BIWEEKLY", "MONTHLY"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={`py-2 px-2 rounded-md text-sm font-medium border transition-colors ${
                frequency === f
                  ? "bg-[#B94040] text-white border-[#B94040]"
                  : "bg-white text-[#7A6358] border-[#E0D5CA] hover:bg-[#F2EDE6]"
              }`}
            >
              {FREQUENCY_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {frequency === "MONTHLY" && (
        <div className="space-y-1.5">
          <Label>¿Cómo se aplica este descuento mensual?</Label>
          <div className="space-y-2">
            {(["FIRST", "SECOND", "SPLIT"] as const).map((m) => (
              <label
                key={m}
                className={`flex items-center gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                  monthlyMode === m ? "border-[#B94040] bg-[#B94040]/5" : "border-[#E0D5CA] hover:bg-[#F2EDE6]"
                }`}
              >
                <input type="radio" name="discountMonthlyMode" checked={monthlyMode === m} onChange={() => setMonthlyMode(m)} className="accent-[#B94040]" />
                <span className="text-sm text-[#2C1F15]">{MONTHLY_MODE_LABELS[m]}</span>
              </label>
            ))}
          </div>
          {monthlyMode === "SPLIT" && (
            <div className="flex items-start gap-2 text-xs text-[#7A6358] bg-[#F2EDE6] rounded-md p-3">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#B94040]" />
              <span>
                Este descuento se dividirá automáticamente en dos aplicaciones: 50% en la primera quincena
                y 50% en la segunda quincena del mes.
              </span>
            </div>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[#B94040]" />
        <span className="text-sm text-[#2C1F15]">Descuento activo (se resta de los cálculos de pago)</span>
      </label>

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2 border-t border-[#F2EDE6]">
        <Button type="button" variant="outline" onClick={onCancel} className="border-[#E0D5CA] w-full sm:w-auto">
          Cancelar
        </Button>
        <Button type="submit" disabled={saving} className="bg-[#B94040] hover:bg-[#9E3636] text-white w-full sm:flex-1">
          {saving ? "Guardando..." : editing ? "Actualizar descuento" : "Crear descuento"}
        </Button>
      </div>
    </form>
  );
}
