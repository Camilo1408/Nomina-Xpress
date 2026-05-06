"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

interface ExistingAdjustment {
  id: string;
  type: "DISCOUNT" | "BONUS";
  amount: number;
  description: string;
}

interface AdjustmentModalProps {
  employeeId: string;
  employeeName: string;
  from: string;
  to: string;
  onClose: () => void;
  onSaved: () => void;
  editing?: ExistingAdjustment;
}

export function AdjustmentModal({
  employeeId,
  employeeName,
  from,
  to,
  onClose,
  onSaved,
  editing,
}: AdjustmentModalProps) {
  const isEdit = !!editing;
  const [type, setType] = useState<"DISCOUNT" | "BONUS">(editing?.type ?? "DISCOUNT");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [loading, setLoading] = useState(false);

  function formatDisplay(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("es-CO");
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    setAmount(digits);
  }

  const amountNum = Number(amount);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amountNum || amountNum < 1) return;
    setLoading(true);

    let res: Response;
    if (isEdit) {
      res = await fetch(`/api/admin/pay-adjustments/${editing!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, amount: amountNum, description }),
      });
    } else {
      res = await fetch("/api/admin/pay-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, type, amount: amountNum, description, periodStart: from, periodEnd: to }),
      });
    }

    setLoading(false);
    if (res.ok) {
      toast.success(isEdit ? "Ajuste actualizado" : "Ajuste guardado");
      onSaved();
    } else {
      toast.error(isEdit ? "Error al actualizar ajuste" : "Error al guardar ajuste");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-[#E0D5CA] shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-heading font-bold text-[#2C1F15]">
            {isEdit ? "Editar ajuste" : "Agregar ajuste"} — {employeeName}
          </h2>
          <button onClick={onClose} className="text-[#7A6358] hover:text-[#2C1F15]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="flex gap-2">
              {(["DISCOUNT", "BONUS"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                    type === t
                      ? t === "DISCOUNT"
                        ? "bg-[#B94040] text-white border-[#B94040]"
                        : "bg-[#6B8E6B] text-white border-[#6B8E6B]"
                      : "bg-white text-[#7A6358] border-[#E0D5CA] hover:bg-[#F2EDE6]"
                  }`}
                >
                  {t === "DISCOUNT" ? "Descuento" : "Bono"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Monto (COP)</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={formatDisplay(amount)}
              onChange={handleAmountChange}
              required
              placeholder="50.000"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="Ej: Descuento por inasistencia"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading} className="flex-1 bg-[#C1643F] hover:bg-[#A8522F] text-white">
              {loading ? "Guardando..." : isEdit ? "Actualizar ajuste" : "Guardar ajuste"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="border-[#E0D5CA]">
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
