"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { CONTEST_CRITERIA_LABELS, WINNER_MODE_LABELS, type ContestCriteria, type WinnerMode } from "@/lib/contests";
import { Check, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import type { ContestItem, Employee } from "./types";

/**
 * Registro de resultados y adjudicación de un ítem.
 *
 * El sistema no conoce las ventas —viven en el módulo de inventario, en otra base
 * de datos—, así que la captura es manual. La tabla marca en vivo quién alcanza
 * la meta para que la adjudicación no sea una sorpresa.
 */
export function ResultsModal({
  contestId,
  item,
  contestStatus,
  canAward,
  onClose,
  onSaved,
}: {
  contestId: string;
  item: ContestItem;
  contestStatus: string;
  canAward: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [achieved, setAchieved] = useState<Record<string, string>>({});
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const criteria = item.criteria as ContestCriteria;
  const esManual = criteria === "SELECCION_MANUAL";
  const usaFecha = criteria === "PRIMERO_EN_ALCANZAR";

  useEffect(() => {
    (async () => {
      const [empRes, detRes] = await Promise.all([
        fetch("/api/admin/employees"),
        fetch(`/api/admin/contests/${contestId}`),
      ]);
      const emps = await empRes.json().catch(() => []);
      setEmployees((Array.isArray(emps) ? emps : []).filter((e: Employee) => e.active));

      const det = await detRes.json().catch(() => null);
      const fresh = det?.contest?.items?.find((i: ContestItem) => i.id === item.id);
      const vals: Record<string, string> = {};
      const fechas: Record<string, string> = {};
      for (const r of fresh?.results ?? []) {
        vals[r.employeeId] = String(r.value);
        if (r.achievedAt) fechas[r.employeeId] = String(r.achievedAt).slice(0, 10);
      }
      setValues(vals);
      setAchieved(fechas);
      setLoading(false);
    })();
  }, [contestId, item.id]);

  function cumple(v: string): boolean {
    const n = parseFloat(v);
    if (isNaN(n)) return false;
    return criteria === "MENOR_VALOR" ? n <= item.goalValue : n >= item.goalValue;
  }

  const conResultado = employees.filter((e) => values[e.id] !== undefined && values[e.id] !== "");
  const califican = conResultado.filter((e) => cumple(values[e.id]));

  async function guardarResultados() {
    const results = conResultado.map((e) => ({
      employeeId: e.id,
      value: parseFloat(values[e.id]),
      achievedAt: achieved[e.id] ? new Date(`${achieved[e.id]}T12:00:00`).toISOString() : null,
    }));
    if (results.length === 0) return toast.error("Registra al menos un resultado");

    setSaving(true);
    const res = await fetch(`/api/admin/contests/${contestId}/items/${item.id}/results`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    });
    setSaving(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) return toast.error(data?.error?.message ?? "No se pudieron guardar los resultados");
    toast.success(`${results.length} resultado(s) guardados · ${data?.qualifiedCount ?? 0} alcanzan la meta`);
    onSaved();
  }

  async function adjudicar() {
    setSaving(true);
    const res = await fetch(`/api/admin/contests/${contestId}/items/${item.id}/award`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manualIds.length > 0 ? { manualEmployeeIds: manualIds } : {}),
    });
    setSaving(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error?.message ?? "No se pudo adjudicar");
      return;
    }
    const nombres = (data?.bonuses ?? []).map((b: { employeeName?: string }) => b.employeeName).join(", ");
    toast.success(`Bono generado para ${nombres} por ${formatCurrency(data?.reservedAmount ?? 0)}`);
    onSaved();
    onClose();
  }

  const inputCls =
    "w-full h-8 px-2 rounded-md border border-[#E0D5CA] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C1643F]/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-[#E0D5CA]">
          <div>
            <h2 className="text-lg font-heading font-bold text-[#2C1F15]">{item.name}</h2>
            <p className="text-sm text-[#7A6358] mt-0.5">
              Meta: <strong>{item.goalValue} {item.goalUnit}</strong> ·{" "}
              {CONTEST_CRITERIA_LABELS[criteria]} · {WINNER_MODE_LABELS[item.winnerMode as WinnerMode]}
            </p>
            <p className="text-sm text-[#C1643F] mt-1 font-mono">
              Premio en juego: {formatCurrency(item.reserve?.reservedAmount ?? 0)}
              <span className="text-[#A08878]">
                {" "}({item.percent}% sobre {formatCurrency(item.reserve?.tipBase ?? 0)} en {item.reserve?.days ?? 0} día(s))
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-[#7A6358] hover:text-[#2C1F15]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-[#7A6358]">Cargando...</p>
          ) : (
            <>
              <div className="rounded-lg border border-[#E0D5CA] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#F2EDE6]">
                    <tr className="text-left text-xs text-[#7A6358]">
                      {esManual && <th className="px-3 py-2 w-10"></th>}
                      <th className="px-3 py-2 font-medium">Personal</th>
                      <th className="px-3 py-2 font-medium w-32">Resultado</th>
                      {usaFecha && <th className="px-3 py-2 font-medium w-40">Fecha de logro</th>}
                      <th className="px-3 py-2 font-medium w-28">Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => {
                      const v = values[e.id] ?? "";
                      const ok = v !== "" && cumple(v);
                      return (
                        <tr key={e.id} className="border-t border-[#E0D5CA]">
                          {esManual && (
                            <td className="px-3 py-2">
                              <input type="checkbox" disabled={!ok}
                                checked={manualIds.includes(e.id)}
                                onChange={(ev) =>
                                  setManualIds((p) => ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id))
                                }
                                className="accent-[#C1643F]" />
                            </td>
                          )}
                          <td className="px-3 py-2 text-[#2C1F15]">{e.name}</td>
                          <td className="px-3 py-2">
                            <input type="number" step="any" value={v}
                              onChange={(ev) => setValues((p) => ({ ...p, [e.id]: ev.target.value }))}
                              placeholder="—" className={inputCls} />
                          </td>
                          {usaFecha && (
                            <td className="px-3 py-2">
                              <input type="date" value={achieved[e.id] ?? ""}
                                onChange={(ev) => setAchieved((p) => ({ ...p, [e.id]: ev.target.value }))}
                                className={inputCls} />
                            </td>
                          )}
                          <td className="px-3 py-2">
                            {v === "" ? (
                              <span className="text-xs text-[#A08878]">sin dato</span>
                            ) : ok ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[#6B8E6B] font-medium">
                                <Check className="w-3.5 h-3.5" /> cumple
                              </span>
                            ) : (
                              <span className="text-xs text-[#B94040]">no cumple</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-[#7A6358]">
                {califican.length} de {conResultado.length} con resultado alcanzan la meta.
                {esManual && " Marca a quién premiar entre los que cumplen."}
                {usaFecha && " Sin fecha de logro, un empleado no compite en este criterio."}
              </p>

              {contestStatus !== "FINALIZADO" && (
                <p className="text-xs text-[#A08878] italic">
                  El concurso debe estar FINALIZADO para poder adjudicar. Mientras tanto puedes
                  ir guardando resultados.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 p-5 border-t border-[#E0D5CA]">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cerrar</Button>
          {canAward && item.outcome === "PENDIENTE" && (
            <>
              <Button variant="outline" onClick={guardarResultados} disabled={saving || loading}
                className="border-[#C1643F] text-[#C1643F] hover:bg-[#C1643F]/10">
                {saving ? "Guardando..." : "Guardar resultados"}
              </Button>
              <Button onClick={adjudicar}
                disabled={saving || loading || contestStatus !== "FINALIZADO" || califican.length === 0}
                className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-1.5">
                <Trophy className="w-4 h-4" /> Adjudicar premio
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
