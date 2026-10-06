"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, getCurrentBiweeklyPeriod } from "@/lib/utils";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, SlidersHorizontal, CalendarDays, Users, FileSpreadsheet, FileDown } from "lucide-react";
import { toast } from "sonner";
import { TipEntryModal } from "./TipEntryModal";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { aggregateTipsReport } from "@/lib/tips-report";

interface Distribution {
  id: string;
  employeeId: string;
  hoursWorked: number;
  tipPercent: number;
  effectiveHours: number;
  amount: number;
  employee: { id: string; name: string };
}

interface ContestReserve {
  id: string;
  contestItemId: string;
  percent: number;
  amount: number;
  contestItem: { name: string; contest: { name: string } };
}

interface TipEntry {
  id: string;
  date: string;
  totalAmount: number;
  menaje: number;
  contestReserved: number;
  netAmount: number;
  periodStart: string;
  periodEnd: string;
  notes: string | null;
  distributions: Distribution[];
  contestReserves?: ContestReserve[];
}

interface TipsClientProps {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExportPdf: boolean;
  canExportExcel: boolean;
}

export function TipsClient({ canCreate, canEdit, canDelete, canExportPdf, canExportExcel }: TipsClientProps) {
  const period = getCurrentBiweeklyPeriod();
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [entries, setEntries] = useState<TipEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TipEntry | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmEntry, setConfirmEntry] = useState<{ id: string; date: string } | null>(null);
  const [view, setView] = useState<"day" | "employee">("day");
  // Rango con el que se cargó la lista: los reportes usan este, no lo escrito sin aplicar.
  const [appliedRange, setAppliedRange] = useState({ from: period.from, to: period.to });
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  // Formato pendiente de confirmar cuando el rango no tiene propinas (reporte en ceros).
  const [confirmEmptyExport, setConfirmEmptyExport] = useState<"pdf" | "excel" | null>(null);

  const fetchTips = useCallback(async (f = from, t = to) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tips?from=${f}&to=${t}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
      setAppliedRange({ from: f, to: t });
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

  async function deleteEntry() {
    if (!confirmEntry) return;
    const res = await fetch(`/api/admin/tips/${confirmEntry.id}`, { method: "DELETE" });
    setConfirmEntry(null);
    if (res.ok) {
      toast.success("Registro eliminado");
      fetchTips();
    } else {
      toast.error("Error al eliminar");
    }
  }

  async function downloadExport(format: "pdf" | "excel") {
    setExporting(format);
    try {
      const params = new URLSearchParams(appliedRange);
      const res = await fetch(`/api/admin/tips/export/${format}?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "No se pudo generar el reporte");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `propinas_${appliedRange.from}_${appliedRange.to}.${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo generar el reporte");
    } finally {
      setExporting(null);
    }
  }

  // Si el rango aplicado no tiene propinas, se avisa y se pide confirmación
  // antes de descargar un reporte en ceros.
  function requestExport(format: "pdf" | "excel") {
    if (entries.length === 0) {
      setConfirmEmptyExport(format);
      return;
    }
    downloadExport(format);
  }

  const totalTips = entries.reduce((s, e) => s + e.totalAmount, 0);
  const totalNet = entries.reduce((s, e) => s + e.netAmount, 0);
  const totalMenaje = entries.reduce((s, e) => s + e.menaje, 0);
  const totalConcursos = entries.reduce((s, e) => s + (e.contestReserved ?? 0), 0);
  const employeeSummaries = aggregateTipsReport(entries).byEmployee;

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-[#E0D5CA] p-4 shadow-[0_1px_3px_rgba(44,31,21,0.08)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#7A6358]">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-[#E0D5CA] rounded-md px-2 py-1.5 text-sm block w-full"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#7A6358]">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-[#E0D5CA] rounded-md px-2 py-1.5 text-sm block w-full"
            />
          </div>
          <Button
            onClick={() => fetchTips()}
            disabled={loading}
            className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-1.5 w-full sm:w-auto"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {loading ? "Cargando..." : "Filtrar"}
          </Button>
          {canCreate && (
            <Button
              onClick={() => setShowModal(true)}
              variant="outline"
              className="gap-1.5 border-[#C1643F] text-[#C1643F] hover:bg-[#C1643F]/10 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" /> Registrar propinas
            </Button>
          )}
        </div>
        {(canExportExcel || canExportPdf) && (
          <div className="flex flex-col sm:flex-row gap-2 pt-3 mt-3 border-t border-[#F2EDE6]">
            {canExportExcel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => requestExport("excel")}
                disabled={exporting !== null}
                className="gap-1.5 border-[#6B8E6B] text-[#6B8E6B] w-full sm:w-auto justify-center"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exporting === "excel" ? "Generando..." : "Exportar Excel (propinas)"}
              </Button>
            )}
            {canExportPdf && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => requestExport("pdf")}
                disabled={exporting !== null}
                className="gap-1.5 border-[#B94040] text-[#B94040] w-full sm:w-auto justify-center"
              >
                <FileDown className="w-4 h-4" />
                {exporting === "pdf" ? "Generando..." : "Exportar PDF (propinas)"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Summary cards — siempre visibles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total propinas brutas", value: formatCurrency(totalTips), color: "#2C1F15" },
          { label: "Provisión menaje (10%)", value: formatCurrency(totalMenaje), color: "#B94040" },
          { label: "Reservado a concursos", value: formatCurrency(totalConcursos), color: "#C1643F" },
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

      {/* Toggle vista */}
      <div className="flex items-center gap-1 bg-[#F2EDE6] rounded-lg p-1 w-fit">
        <button
          onClick={() => setView("day")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === "day"
              ? "bg-white text-[#C1643F] shadow-sm"
              : "text-[#7A6358] hover:text-[#2C1F15]"
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          Por día
        </button>
        <button
          onClick={() => setView("employee")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === "employee"
              ? "bg-white text-[#C1643F] shadow-sm"
              : "text-[#7A6358] hover:text-[#2C1F15]"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Por personal
        </button>
      </div>

      {/* Vista por día */}
      {view === "day" && (
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
                        className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-left min-w-0"
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
                        {canEdit && (
                          <button
                            onClick={() => { setEditingEntry(entry); setShowModal(true); }}
                            className="p-1.5 text-[#7A6358] hover:text-[#C1643F] rounded-md hover:bg-[#F2EDE6] transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setConfirmEntry({ id: entry.id, date: entry.date })}
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
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#7A6358] mb-3">
                          <span>Bruto: <strong className="text-[#2C1F15]">{formatCurrency(entry.totalAmount)}</strong></span>
                          <span>Menaje 10%: <strong className="text-[#B94040]">{formatCurrency(entry.menaje)}</strong></span>
                          {(entry.contestReserved ?? 0) > 0 && (
                            <span>
                              Concursos:{" "}
                              <strong className="text-[#C1643F]">{formatCurrency(entry.contestReserved)}</strong>
                            </span>
                          )}
                          <span>A distribuir: <strong className="text-[#6B8E6B]">{formatCurrency(entry.netAmount)}</strong></span>
                        </div>
                        {(entry.contestReserves?.length ?? 0) > 0 && (
                          <div className="mb-3 rounded-md border border-[#E0D5CA] bg-white px-3 py-2">
                            <p className="text-[11px] font-medium text-[#7A6358] mb-1">
                              Reservado para concursos
                            </p>
                            {entry.contestReserves!.map((r) => (
                              <div key={r.id} className="flex justify-between text-xs py-0.5">
                                <span className="text-[#7A6358]">
                                  {r.contestItem.contest.name} · {r.contestItem.name}{" "}
                                  <span className="text-[#A08878]">({r.percent}%)</span>
                                </span>
                                <span className="font-mono text-[#C1643F]">
                                  −{formatCurrency(r.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {entry.distributions.length === 0 ? (
                          <p className="text-xs text-[#7A6358] italic">
                            Sin horas registradas ese día — no se distribuyó.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] text-xs">
                              <thead>
                                <tr className="border-b border-[#E0D5CA]">
                                  <th className="text-left py-1.5 text-[#7A6358] font-medium">Personal</th>
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
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Vista por personal */}
      {view === "employee" && (
        <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-hidden">
          {loading ? (
            <p className="px-4 py-12 text-center text-[#7A6358] text-sm">Cargando...</p>
          ) : employeeSummaries.length === 0 ? (
            <p className="px-4 py-12 text-center text-[#7A6358] text-sm">
              No hay propinas distribuidas en este período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-[#E0D5CA] bg-[#FAF7F2]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[#7A6358]">Personal</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[#7A6358]">Horas trabajadas</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[#7A6358]">% Asignación</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[#7A6358]">Total recibido</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeSummaries.map((s) => (
                    <tr key={s.employeeId} className="border-b border-[#F2EDE6] last:border-0 hover:bg-[#FAF7F2] transition-colors">
                      <td className="px-4 py-3 text-[#2C1F15] font-medium">{s.employeeName}</td>
                      <td className="px-4 py-3 text-right font-mono text-[#2C1F15]">{s.totalHours.toFixed(2)}h</td>
                      <td className="px-4 py-3 text-right font-mono text-[#2C1F15]">{s.avgTipPercent}%</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#6B8E6B]">{formatCurrency(s.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#E0D5CA] bg-[#FAF7F2]">
                    <td className="px-4 py-3 text-xs font-medium text-[#7A6358]" colSpan={3}>Total distribuido</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#6B8E6B]">
                      {formatCurrency(employeeSummaries.reduce((s, e) => s + e.totalAmount, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmEntry}
        title="Eliminar registro de propinas"
        description={confirmEntry ? `¿Eliminar el registro de propinas del ${formatDate(confirmEntry.date)}? Esta acción no se puede deshacer.` : ""}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={deleteEntry}
        onCancel={() => setConfirmEntry(null)}
      />

      <ConfirmDialog
        open={!!confirmEmptyExport}
        title="No hay propinas en este período"
        description={`No hay propinas registradas entre el ${formatDate(appliedRange.from)} y el ${formatDate(appliedRange.to)}. ¿Deseas descargar el reporte de todas formas? Todos los valores estarán en cero.`}
        confirmLabel="Descargar de todas formas"
        variant="warning"
        onConfirm={() => {
          const format = confirmEmptyExport;
          setConfirmEmptyExport(null);
          if (format) downloadExport(format);
        }}
        onCancel={() => setConfirmEmptyExport(null)}
      />

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
