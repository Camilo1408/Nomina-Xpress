"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { TipEntryModal } from "./TipEntryModal";

interface Distribution {
  id: string;
  employeeId: string;
  hoursWorked: number;
  tipPercent: number;
  effectiveHours: number;
  amount: number;
  employee: { id: string; name: string };
}

interface TipEntry {
  id: string;
  date: string;
  totalAmount: number;
  menaje: number;
  netAmount: number;
  periodStart: string;
  periodEnd: string;
  notes: string | null;
  distributions: Distribution[];
}

interface TipsClientProps {
  role: string;
}

function getCurrentPeriod() {
  const today = new Date();
  const day = today.getDate();
  const year = today.getFullYear();
  const month = today.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (day <= 15) {
    return {
      from: `${year}-${pad(month + 1)}-01`,
      to: `${year}-${pad(month + 1)}-15`,
    };
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${pad(month + 1)}-16`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

export function TipsClient({ role }: TipsClientProps) {
  const period = getCurrentPeriod();
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [entries, setEntries] = useState<TipEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TipEntry | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isSuperAdmin = role === "SUPERADMIN" || role === "PROPRIETARY";

  const fetchTips = useCallback(async (f = from, t = to) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tips?from=${f}&to=${t}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      toast.error("Error al cargar propinas");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  // Cargar automáticamente al montar con la quincena actual
  useEffect(() => {
    fetchTips(period.from, period.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function deleteEntry(id: string, date: string) {
    if (!confirm(`¿Eliminar el registro de propinas del ${formatDate(date)}?`)) return;
    const res = await fetch(`/api/admin/tips/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Registro eliminado");
      fetchTips();
    } else {
      toast.error("Error al eliminar");
    }
  }

  const totalTips = entries.reduce((s, e) => s + e.totalAmount, 0);
  const totalNet = entries.reduce((s, e) => s + e.netAmount, 0);
  const totalMenaje = entries.reduce((s, e) => s + e.menaje, 0);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-[#E0D5CA] p-4 shadow-[0_1px_3px_rgba(44,31,21,0.08)]">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#7A6358]">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-[#E0D5CA] rounded-md px-2 py-1.5 text-sm block"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#7A6358]">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-[#E0D5CA] rounded-md px-2 py-1.5 text-sm block"
            />
          </div>
          <Button
            onClick={() => fetchTips()}
            disabled={loading}
            className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-1.5"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {loading ? "Cargando..." : "Filtrar"}
          </Button>
          <Button
            onClick={() => setShowModal(true)}
            variant="outline"
            className="gap-1.5 border-[#C1643F] text-[#C1643F] hover:bg-[#C1643F]/10"
          >
            <Plus className="w-4 h-4" /> Registrar propinas
          </Button>
        </div>
      </div>

      {/* Summary cards — siempre visibles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Total propinas brutas", value: formatCurrency(totalTips), color: "#2C1F15" },
          { label: "Provisión menaje (10%)", value: formatCurrency(totalMenaje), color: "#B94040" },
          { label: "Total distribuido", value: formatCurrency(totalNet), color: "#6B8E6B" },
        ].map((card) => (
          <Card key={card.label} className="shadow-[0_1px_3px_rgba(44,31,21,0.08)]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-[#7A6358]">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold font-mono" style={{ color: card.color }}>
                {card.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entries list — siempre visible */}
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-hidden">
        {loading ? (
          <p className="px-4 py-12 text-center text-[#7A6358] text-sm">Cargando...</p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-12 text-center text-[#7A6358] text-sm">
            No hay propinas registradas en este período.
          </p>
        ) : (
          <div className="divide-y divide-[#F2EDE6]">
            {entries.map((entry) => {
              const expanded = expandedId === entry.id;
              return (
                <div key={entry.id}>
                  {/* Row header */}
                  <div className="flex items-center gap-2 px-4 py-3 hover:bg-[#FAF7F2] transition-colors">
                    <button
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
                      <span className="text-[#7A6358]">
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                      <span className="font-mono text-sm text-[#2C1F15] font-medium">
                        {formatDate(entry.date)}
                      </span>
                      <Badge className="bg-[#C1643F]/10 text-[#C1643F] border-0 text-xs">
                        {formatCurrency(entry.totalAmount)}
                      </Badge>
                      <span className="text-xs text-[#7A6358]">
                        → dist. {formatCurrency(entry.netAmount)}
                      </span>
                      {entry.notes && (
                        <span className="text-xs text-[#7A6358] truncate hidden sm:block">
                          {entry.notes}
                        </span>
                      )}
                    </button>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditingEntry(entry); setShowModal(true); }}
                        className="p-1.5 text-[#7A6358] hover:text-[#C1643F] rounded-md hover:bg-[#F2EDE6] transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => deleteEntry(entry.id, entry.date)}
                          className="p-1.5 text-[#7A6358] hover:text-[#B94040] rounded-md hover:bg-[#F2EDE6] transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded: distribution detail */}
                  {expanded && (
                    <div className="bg-[#FAF7F2] px-4 pb-4 pt-2">
                      <div className="flex gap-4 text-xs text-[#7A6358] mb-3">
                        <span>Bruto: <strong className="text-[#2C1F15]">{formatCurrency(entry.totalAmount)}</strong></span>
                        <span>Menaje 10%: <strong className="text-[#B94040]">{formatCurrency(entry.menaje)}</strong></span>
                        <span>A distribuir: <strong className="text-[#6B8E6B]">{formatCurrency(entry.netAmount)}</strong></span>
                      </div>
                      {entry.distributions.length === 0 ? (
                        <p className="text-xs text-[#7A6358] italic">
                          Sin horas registradas ese día — no se distribuyó.
                        </p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#E0D5CA]">
                              <th className="text-left py-1.5 text-[#7A6358] font-medium">Empleado</th>
                              <th className="text-right py-1.5 text-[#7A6358] font-medium">Horas</th>
                              <th className="text-right py-1.5 text-[#7A6358] font-medium">% Prop.</th>
                              <th className="text-right py-1.5 text-[#7A6358] font-medium">Hs. ef.</th>
                              <th className="text-right py-1.5 text-[#7A6358] font-medium">Prop./h</th>
                              <th className="text-right py-1.5 text-[#7A6358] font-medium">Propina</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.distributions.map((d) => {
                              const ratePerHour = d.effectiveHours > 0 ? d.amount / d.effectiveHours : 0;
                              return (
                                <tr key={d.id} className="border-b border-[#F2EDE6] last:border-0">
                                  <td className="py-1.5 text-[#2C1F15]">{d.employee.name}</td>
                                  <td className="py-1.5 text-right font-mono text-[#2C1F15]">{d.hoursWorked.toFixed(2)}h</td>
                                  <td className="py-1.5 text-right font-mono text-[#2C1F15]">{d.tipPercent}%</td>
                                  <td className="py-1.5 text-right font-mono text-[#2C1F15]">{d.effectiveHours.toFixed(2)}h</td>
                                  <td className="py-1.5 text-right font-mono text-[#7A6358]">{formatCurrency(Math.round(ratePerHour))}</td>
                                  <td className="py-1.5 text-right font-mono font-bold text-[#6B8E6B]">{formatCurrency(d.amount)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <TipEntryModal
          editing={editingEntry ? {
            id: editingEntry.id,
            date: editingEntry.date,
            totalAmount: editingEntry.totalAmount,
            notes: editingEntry.notes,
          } : null}
          onClose={() => { setShowModal(false); setEditingEntry(null); }}
          onSaved={() => { setShowModal(false); setEditingEntry(null); fetchTips(); }}
        />
      )}
    </div>
  );
}
