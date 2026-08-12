"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatCurrency, todayColombia } from "@/lib/utils";

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 9);
}
function displayThousands(raw: string): string {
  if (!raw) return "";
  return Number(raw).toLocaleString("es-CO");
}

interface DeductionInfo {
  menajePercent: number;
  contestPercent: number;
  totalPercent: number;
  items: { contestItemId: string; percent: number; itemName: string; contestName: string; frozen: boolean }[];
}

interface TipEntryModalProps {
  editing?: { id: string; date: string; totalAmount: number; notes: string | null } | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TipEntryModal({ editing, onClose, onSaved }: TipEntryModalProps) {
  const [date, setDate] = useState(editing?.date ?? todayColombia());
  const [totalAmount, setTotalAmount] = useState(editing ? String(Math.round(editing.totalAmount)) : "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [deductions, setDeductions] = useState<DeductionInfo | null>(null);

  // Descuento real de la fecha elegida: menaje + concursos activos ese día.
  // Se consulta al servidor porque es el único que sabe qué concursos aplican.
  useEffect(() => {
    if (!date) return;
    let cancelado = false;
    (async () => {
      const res = await fetch(`/api/admin/tips/deductions?date=${date}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (!cancelado) setDeductions(data);
    })();
    return () => { cancelado = true; };
  }, [date]);

  const bruto = Number(totalAmount) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(totalAmount);
    if (!date || isNaN(amount) || amount <= 0) {
      toast.error("Ingresa una fecha y un valor de propinas válido (mayor a 0)");
      return;
    }

    setLoading(true);
    try {
      const url = editing ? `/api/admin/tips/${editing.id}` : "/api/admin/tips";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, totalAmount: amount, notes: notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message ?? "Error al guardar");
        return;
      }
      toast.success(editing ? "Propinas actualizadas" : "Propinas registradas y distribuidas");
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-md mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-heading font-bold text-[#2C1F15]">
          {editing ? "Editar propinas del día" : "Registrar propinas del día"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tip-date">Fecha</Label>
            <Input
              id="tip-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={!!editing}
              max={todayColombia()}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tip-amount">Total propinas (COP)</Label>
            <Input
              id="tip-amount"
              type="text"
              inputMode="numeric"
              placeholder="Ej: 150.000"
              value={displayThousands(totalAmount)}
              onChange={(e) => setTotalAmount(digitsOnly(e.target.value))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tip-notes">Notas (opcional)</Label>
            <Input
              id="tip-notes"
              type="text"
              placeholder="Observaciones..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="text-xs text-[#7A6358] bg-[#F2EDE6] rounded-md p-3 space-y-1">
            <div className="flex justify-between">
              <span>Provisión de menaje ({deductions?.menajePercent ?? 10}%)</span>
              <span className="font-mono text-[#B94040]">
                −{formatCurrency(Math.round(bruto * ((deductions?.menajePercent ?? 10) / 100)))}
              </span>
            </div>
            {(deductions?.items ?? []).map((it) => (
              <div key={it.contestItemId} className="flex justify-between">
                <span>
                  {it.contestName} · {it.itemName} ({it.percent}%)
                  {it.frozen && <span className="text-[#A08878]"> · congelado</span>}
                </span>
                <span className="font-mono text-[#C1643F]">
                  −{formatCurrency(Math.round(bruto * (it.percent / 100)))}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-[#E0D5CA] pt-1 font-medium">
              <span>Queda para distribuir ({Math.round((100 - (deductions?.totalPercent ?? 10)) * 100) / 100}%)</span>
              <span className="font-mono text-[#6B8E6B]">
                {formatCurrency(Math.round(bruto * ((100 - (deductions?.totalPercent ?? 10)) / 100)))}
              </span>
            </div>
            <p className="pt-1 text-[#A08878]">
              El neto se reparte entre los empleados según las horas trabajadas ese día y su
              porcentaje de asignación de propinas.
            </p>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]"
            >
              {loading ? "Guardando..." : editing ? "Actualizar" : "Registrar y distribuir"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
