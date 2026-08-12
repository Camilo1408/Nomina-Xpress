"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CONTEST_CRITERIA,
  CONTEST_CRITERIA_LABELS,
  PAYOUT_MODES,
  PAYOUT_MODE_LABELS,
  WINNER_MODES,
  WINNER_MODE_LABELS,
  TIP_CONTEST_MAX_PERCENT,
  TIP_MENAJE_PERCENT,
} from "@/lib/contests";
import { getCurrentBiweeklyPeriod } from "@/lib/utils";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

interface ItemDraft {
  name: string;
  description: string;
  goalValue: string;
  goalUnit: string;
  criteria: string;
  percent: string;
  winnerMode: string;
}

function emptyItem(): ItemDraft {
  return {
    name: "",
    description: "",
    goalValue: "",
    goalUnit: "unidades",
    criteria: "MAYOR_VALOR",
    percent: "",
    winnerMode: "GANADOR_UNICO",
  };
}

export function ContestModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const period = getCurrentBiweeklyPeriod();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(period.from);
  const [endDate, setEndDate] = useState(period.to);
  const [payoutMode, setPayoutMode] = useState("UNICO");
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);

  const totalPercent = items.reduce((s, i) => s + (parseFloat(i.percent) || 0), 0);
  const excede = Math.round(totalPercent * 100) / 100 > TIP_CONTEST_MAX_PERCENT;

  function setItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function submit() {
    if (!name.trim()) return toast.error("Ponle un nombre al concurso");
    if (endDate < startDate) return toast.error("La fecha de fin no puede ser anterior a la de inicio");
    if (items.length === 0) return toast.error("Añade al menos un ítem");
    for (const it of items) {
      if (!it.name.trim()) return toast.error("Todos los ítems necesitan nombre");
      if (!(parseFloat(it.percent) > 0)) return toast.error(`El ítem "${it.name}" necesita un porcentaje mayor que 0`);
      if (it.goalValue === "" || isNaN(parseFloat(it.goalValue)))
        return toast.error(`El ítem "${it.name}" necesita una meta`);
    }
    if (excede) return toast.error(`Los ítems suman ${totalPercent}%, por encima del tope del ${TIP_CONTEST_MAX_PERCENT}%`);

    setSaving(true);
    const res = await fetch("/api/admin/contests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        startDate,
        endDate,
        payoutMode,
        items: items.map((i) => ({
          name: i.name.trim(),
          description: i.description.trim() || null,
          goalValue: parseFloat(i.goalValue),
          goalUnit: i.goalUnit.trim() || "unidades",
          criteria: i.criteria,
          percent: parseFloat(i.percent),
          winnerMode: i.winnerMode,
        })),
      }),
    });
    setSaving(false);

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error?.message ?? "No se pudo crear el concurso");
      return;
    }
    toast.success("Concurso creado en borrador. Actívalo cuando quieras que empiece a reservar.");
    onSaved();
  }

  const inputCls =
    "w-full h-9 px-3 rounded-md border border-[#E0D5CA] text-sm focus:outline-none focus:ring-2 focus:ring-[#C1643F]/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[#E0D5CA]">
          <div>
            <h2 className="text-lg font-heading font-bold text-[#2C1F15]">Nuevo concurso</h2>
            <p className="text-sm text-[#7A6358] mt-0.5">
              Se crea en borrador: no descuenta nada hasta que lo actives
            </p>
          </div>
          <button onClick={onClose} className="text-[#7A6358] hover:text-[#2C1F15]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-[#2C1F15] mb-1.5">Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Incentivos de ventas" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-[#2C1F15] mb-1.5">
                Descripción <span className="text-[#A08878] font-normal">(opcional)</span>
              </label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#2C1F15] mb-1.5">Inicio</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#2C1F15] mb-1.5">Fin</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-[#2C1F15] mb-1.5">Modalidad de pago del bono</label>
              <select value={payoutMode} onChange={(e) => setPayoutMode(e.target.value)} className={inputCls}>
                {PAYOUT_MODES.map((m) => (
                  <option key={m} value={m}>{PAYOUT_MODE_LABELS[m]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-heading font-bold text-[#2C1F15]">Ítems y premios</h3>
              <Button type="button" variant="outline" size="sm"
                onClick={() => setItems((p) => [...p, emptyItem()])}
                className="gap-1.5 border-[#C1643F] text-[#C1643F] hover:bg-[#C1643F]/10">
                <Plus className="w-3.5 h-3.5" /> Añadir ítem
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={idx} className="rounded-lg border border-[#E0D5CA] p-4 space-y-3 bg-[#FAF7F2]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#7A6358]">Ítem {idx + 1}</span>
                    {items.length > 1 && (
                      <button onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                        className="text-[#B94040] hover:text-[#9A3535]">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-[#2C1F15] mb-1">Nombre del ítem</label>
                      <input value={it.name} onChange={(e) => setItem(idx, { name: e.target.value })}
                        placeholder="Venta de cervezas" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#2C1F15] mb-1">Meta</label>
                      <input type="number" step="any" value={it.goalValue}
                        onChange={(e) => setItem(idx, { goalValue: e.target.value })}
                        placeholder="200" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#2C1F15] mb-1">Unidad</label>
                      <input value={it.goalUnit} onChange={(e) => setItem(idx, { goalUnit: e.target.value })}
                        placeholder="unidades" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#2C1F15] mb-1">Criterio del ganador</label>
                      <select value={it.criteria} onChange={(e) => setItem(idx, { criteria: e.target.value })} className={inputCls}>
                        {CONTEST_CRITERIA.map((c) => (
                          <option key={c} value={c}>{CONTEST_CRITERIA_LABELS[c]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#2C1F15] mb-1">Reparto del premio</label>
                      <select value={it.winnerMode} onChange={(e) => setItem(idx, { winnerMode: e.target.value })} className={inputCls}>
                        {WINNER_MODES.map((w) => (
                          <option key={w} value={w}>{WINNER_MODE_LABELS[w]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-[#2C1F15] mb-1">
                        % de las propinas destinado a este ítem
                      </label>
                      <input type="number" step="0.01" min="0.01" max={TIP_CONTEST_MAX_PERCENT}
                        value={it.percent} onChange={(e) => setItem(idx, { percent: e.target.value })}
                        placeholder="2" className={inputCls} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen del descuento: lo que verá el personal en su reparto */}
          <div className="rounded-lg border border-[#E0D5CA] bg-[#F2EDE6] p-4">
            <p className="text-xs font-medium text-[#7A6358] mb-2">
              Descuento total sobre las propinas de cada día del rango
            </p>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-mono">
              <span className="text-[#B94040]">{TIP_MENAJE_PERCENT}% menaje</span>
              {items.filter((i) => parseFloat(i.percent) > 0).map((i, idx) => (
                <span key={idx} className="text-[#C1643F]">
                  + {parseFloat(i.percent)}% {i.name.trim() || `ítem ${idx + 1}`}
                </span>
              ))}
              <span className="text-[#2C1F15] font-bold">
                = {Math.round((TIP_MENAJE_PERCENT + totalPercent) * 100) / 100}%
              </span>
              <span className="text-[#6B8E6B]">
                → queda {Math.round((100 - TIP_MENAJE_PERCENT - totalPercent) * 100) / 100}% para el personal
              </span>
            </div>
            {excede && (
              <p className="text-xs text-[#B94040] mt-2">
                Los concursos no pueden pasar del {TIP_CONTEST_MAX_PERCENT}% (tope total del{" "}
                {TIP_MENAJE_PERCENT + TIP_CONTEST_MAX_PERCENT}% con el menaje).
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-[#E0D5CA]">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || excede}
            className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]">
            {saving ? "Creando..." : "Crear concurso"}
          </Button>
        </div>
      </div>
    </div>
  );
}
