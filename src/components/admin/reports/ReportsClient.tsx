"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatHours } from "@/lib/utils";
import { FileDown, FileSpreadsheet, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { PayrollResult } from "@/lib/payroll";
import type { BonusApplied } from "@/lib/bonuses";
import type { DiscountApplied } from "@/lib/discounts";
import { AdjustmentModal } from "./AdjustmentModal";
import { SearchableSelect } from "@/components/ui/searchable-select";

type PayrollWithTips = PayrollResult & {
  totalTips: number;
  netPayWithTips: number;
  bonuses: BonusApplied[];
  totalBonuses: number;
  discounts: DiscountApplied[];
  totalDiscounts: number;
  finalPay: number;
  tipDistributions: { date: string; amount: number; hoursWorked: number; tipPercent: number }[];
};

interface Employee { id: string; name: string; }

export type ReportType = "payroll" | "shifts";

interface ReportsClientProps {
  employees: Employee[];
  canExportPdf: boolean;
  canExportExcel: boolean;
  canAddAdjustment: boolean;
  canEditAdjustment: boolean;
  canDeleteAdjustment: boolean;
  reportType?: ReportType;
}

const REPORT_LABELS: Record<ReportType, { buttonLabel: string; fileSlug: string }> = {
  payroll: { buttonLabel: "Calcular nómina", fileSlug: "nomina" },
  shifts:  { buttonLabel: "Calcular turnos", fileSlug: "turnos" },
};

function getCurrentPeriod(): { from: string; to: string } {
  const today = new Date();
  const day = today.getDate();
  const year = today.getFullYear();
  const month = today.getMonth();
  if (day <= 15) {
    return {
      from: new Date(year, month, 1).toISOString().split("T")[0],
      to: new Date(year, month, 15).toISOString().split("T")[0],
    };
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: new Date(year, month, 16).toISOString().split("T")[0],
    to: new Date(year, month, lastDay).toISOString().split("T")[0],
  };
}

export function ReportsClient({ employees, canExportPdf, canExportExcel, canAddAdjustment, canEditAdjustment, canDeleteAdjustment, reportType = "payroll" }: ReportsClientProps) {
  const labels = REPORT_LABELS[reportType];
  const period = getCurrentPeriod();
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [results, setResults] = useState<PayrollWithTips[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [adjustmentTarget, setAdjustmentTarget] = useState<{ employeeId: string; name: string } | null>(null);
  const [editingAdjustment, setEditingAdjustment] = useState<{
    id: string; type: "DISCOUNT" | "BONUS"; amount: number; description: string;
    employeeId: string; name: string;
  } | null>(null);

  async function fetchReport() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, type: reportType });
      if (selectedEmployee) params.set("employeeId", selectedEmployee);
      const res = await fetch(`/api/admin/reports/payroll?${params}`);
      const data = await res.json();
      setResults(data.employees);
    } catch {
      toast.error("Error al cargar el reporte");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAdjustment(id: string) {
    const res = await fetch(`/api/admin/pay-adjustments/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Ajuste eliminado");
      fetchReport();
    } else {
      toast.error("Error al eliminar ajuste");
    }
  }

  function downloadExport(format: "pdf" | "excel") {
    const params = new URLSearchParams({ from, to, type: reportType });
    const url = `/api/admin/reports/payroll/export/${format === "pdf" ? "pdf" : "excel"}?${params}`;
    window.open(url, "_blank");
  }

  const totalNet = results?.reduce((s, e) => s + e.netPay, 0) ?? 0;
  const totalNormalH = results?.reduce((s, e) => s + e.normalHours, 0) ?? 0;
  const totalSpecialH = results?.reduce((s, e) => s + e.specialHours, 0) ?? 0;
  const totalTips = results?.reduce((s, e) => s + e.totalTips, 0) ?? 0;
  const totalBonuses = results?.reduce((s, e) => s + e.totalBonuses, 0) ?? 0;
  const totalDiscounts = results?.reduce((s, e) => s + e.totalDiscounts, 0) ?? 0;
  const totalFinal = results?.reduce((s, e) => s + e.finalPay, 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-[#E0D5CA] p-4 shadow-[0_1px_3px_rgba(44,31,21,0.08)] space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#7A6358]">Desde</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-[#E0D5CA] rounded-md px-2 py-1.5 text-sm block w-full" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#7A6358]">Hasta</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-[#E0D5CA] rounded-md px-2 py-1.5 text-sm block w-full" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#7A6358]">Personal</label>
            <SearchableSelect
              value={selectedEmployee}
              onValueChange={setSelectedEmployee}
              placeholder="Buscar personal…"
              emptyOption={{ value: "", label: "Todos" }}
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
            />
          </div>
          <Button onClick={fetchReport} disabled={loading} className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] w-full sm:w-auto">
            {loading ? "Calculando..." : labels.buttonLabel}
          </Button>
        </div>
        {results && results.length > 0 && (canExportExcel || canExportPdf) && (
          <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-[#F2EDE6]">
            {canExportExcel && (
              <Button variant="outline" size="sm" onClick={() => downloadExport("excel")} className="gap-1.5 border-[#6B8E6B] text-[#6B8E6B] w-full sm:w-auto justify-center">
                <FileSpreadsheet className="w-4 h-4" /> Exportar Excel ({labels.fileSlug})
              </Button>
            )}
            {canExportPdf && (
              <Button variant="outline" size="sm" onClick={() => downloadExport("pdf")} className="gap-1.5 border-[#B94040] text-[#B94040] w-full sm:w-auto justify-center">
                <FileDown className="w-4 h-4" /> Exportar PDF ({labels.fileSlug})
              </Button>
            )}
          </div>
        )}
      </div>

      {results && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
            {[
              { label: "Horas normales", value: formatHours(totalNormalH), color: "#6B8E6B" },
              { label: "Horas especiales", value: formatHours(totalSpecialH), color: "#C1643F" },
              { label: "Total neto", value: formatCurrency(totalNet), color: "#2C1F15" },
              { label: "Propinas", value: formatCurrency(totalTips), color: "#C1643F" },
              { label: "Bonos", value: formatCurrency(totalBonuses), color: "#6B8E6B" },
              { label: "Descuentos", value: formatCurrency(totalDiscounts), color: "#B94040" },
              { label: "Total final", value: formatCurrency(totalFinal), color: "#6B8E6B" },
            ].map((card) => (
              <Card key={card.label} className="shadow-[0_1px_3px_rgba(44,31,21,0.08)]">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-[#7A6358]">{card.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-bold font-mono" style={{ color: card.color }}>{card.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Results table */}
          <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-[#E0D5CA] bg-[#C1643F]/8">
                  <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Personal</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#2C1F15]">H. Normal</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#2C1F15]">H. Especial</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#2C1F15]">Ajustes</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#2C1F15]">Neto</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#C1643F]">Propinas</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#6B8E6B]">Bonos</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#B94040]">Descuentos</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#6B8E6B]">Total final</th>
                  {canAddAdjustment && <th className="text-right px-4 py-3 font-semibold text-[#2C1F15]">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {results.map((emp, i) => (
                  <tr key={emp.employeeId} className={`border-b border-[#F2EDE6] last:border-0 ${i % 2 === 1 ? "bg-[#F2EDE6]/50" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#2C1F15]">{emp.employeeName}</p>
                      {emp.adjustments.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {emp.adjustments.map((adj) => (
                            <div key={adj.id} className="flex items-center gap-1 group">
                              <span className={`text-xs ${adj.type === "BONUS" ? "text-[#6B8E6B]" : "text-[#B94040]"}`}>
                                {adj.type === "BONUS" ? "+" : "-"}{formatCurrency(adj.amount)}
                              </span>
                              <span className="text-xs text-[#7A6358]">— {adj.description}</span>
                              {canEditAdjustment && (
                                <button
                                  onClick={() => setEditingAdjustment({ ...adj, type: adj.type as "DISCOUNT" | "BONUS", employeeId: emp.employeeId, name: emp.employeeName })}
                                  className="ml-1 opacity-0 group-hover:opacity-100 text-[#7A6358] hover:text-[#C1643F] transition-all"
                                  title="Editar ajuste"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                              {canDeleteAdjustment && (
                                <button
                                  onClick={() => deleteAdjustment(adj.id)}
                                  className="opacity-0 group-hover:opacity-100 text-[#7A6358] hover:text-[#B94040] transition-all"
                                  title="Eliminar ajuste"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {emp.bonuses.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {emp.bonuses.map((b) => (
                            <div key={b.bonusId} className="flex items-center gap-1 flex-wrap">
                              <span className="text-xs text-[#6B8E6B] font-medium">
                                +{formatCurrency(b.appliedAmount)}
                              </span>
                              <span className="text-xs text-[#7A6358]">— Bono: {b.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {emp.discounts.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {emp.discounts.map((d) => (
                            <div key={d.discountId} className="flex items-center gap-1 flex-wrap">
                              <span className="text-xs text-[#B94040] font-medium">
                                −{formatCurrency(d.appliedAmount)}
                              </span>
                              <span className="text-xs text-[#7A6358]">— Descuento: {d.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#2C1F15]">{formatHours(emp.normalHours)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {emp.specialHours > 0 ? (
                        <span className="text-[#C1643F]">{formatHours(emp.specialHours)}</span>
                      ) : <span className="text-[#7A6358]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={emp.totalAdjustments >= 0 ? "text-[#6B8E6B]" : "text-[#B94040]"}>
                        {emp.totalAdjustments >= 0 ? "+" : ""}{formatCurrency(emp.totalAdjustments)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#6B8E6B]">{formatCurrency(emp.netPay)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[#C1643F]">
                      {emp.totalTips > 0 ? formatCurrency(emp.totalTips) : <span className="text-[#7A6358]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#6B8E6B]">
                      {emp.totalBonuses > 0 ? formatCurrency(emp.totalBonuses) : <span className="text-[#7A6358]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#B94040]">
                      {emp.totalDiscounts > 0 ? `−${formatCurrency(emp.totalDiscounts)}` : <span className="text-[#7A6358]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#6B8E6B]">{formatCurrency(emp.finalPay)}</td>
                    {canAddAdjustment && (
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAdjustmentTarget({ employeeId: emp.employeeId, name: emp.employeeName })}
                        className="text-[#7A6358] hover:text-[#C1643F] h-8 gap-1"
                      >
                        <Plus className="w-3 h-3" /> Ajuste
                      </Button>
                    </td>
                    )}
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-[#7A6358]">
                      No hay datos para este período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {adjustmentTarget && (
        <AdjustmentModal
          employeeId={adjustmentTarget.employeeId}
          employeeName={adjustmentTarget.name}
          from={from}
          to={to}
          onClose={() => setAdjustmentTarget(null)}
          onSaved={() => { setAdjustmentTarget(null); fetchReport(); }}
        />
      )}

      {editingAdjustment && (
        <AdjustmentModal
          employeeId={editingAdjustment.employeeId}
          employeeName={editingAdjustment.name}
          from={from}
          to={to}
          editing={{
            id: editingAdjustment.id,
            type: editingAdjustment.type,
            amount: editingAdjustment.amount,
            description: editingAdjustment.description,
          }}
          onClose={() => setEditingAdjustment(null)}
          onSaved={() => { setEditingAdjustment(null); fetchReport(); }}
        />
      )}
    </div>
  );
}
