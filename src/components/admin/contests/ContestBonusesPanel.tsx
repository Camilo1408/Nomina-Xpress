"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CONTEST_BONUS_STATUS_LABELS, type ContestBonusStatus } from "@/lib/contests";
import { BadgeDollarSign, Ban, Check } from "lucide-react";
import { toast } from "sonner";
import type { ContestBonus } from "./types";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDIENTE: { bg: "#FDF0E6", text: "#A8522F" },
  PARCIAL: { bg: "#E8EEF5", text: "#4A6B8A" },
  PAGADO: { bg: "#E9F1E9", text: "#3F6B3F" },
  ANULADO: { bg: "#F7E9E9", text: "#B94040" },
};

export function ContestBonusesPanel({
  canPay,
  canAward,
  refreshKey,
}: {
  canPay: boolean;
  canAward: boolean;
  refreshKey: number;
}) {
  const [bonuses, setBonuses] = useState<ContestBonus[]>([]);
  const [totals, setTotals] = useState({ total: 0, paid: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const fetchBonuses = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const res = await fetch("/api/admin/contest-bonuses");
      const data = await res.json().catch(() => null);
      if (cancelado) return;
      setBonuses(data?.bonuses ?? []);
      setTotals(data?.totals ?? { total: 0, paid: 0, pending: 0 });
      setLoading(false);
    })();
    return () => { cancelado = true; };
  }, [reloadKey, refreshKey]);

  async function pay(bonus: ContestBonus, paymentId: string, amount: number) {
    if (!window.confirm(
      `¿Marcar como pagada la cuota de ${formatCurrency(amount)} a ${bonus.employee.name}?\n\n` +
      `Esta acción no se puede deshacer.`
    )) return;

    setPayingId(paymentId);
    const res = await fetch(`/api/admin/contest-bonuses/${bonus.id}/payments/${paymentId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setPayingId(null);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error?.message ?? "No se pudo registrar el pago");
      fetchBonuses();
      return;
    }
    toast.success(
      data.pendingAmount > 0
        ? `Cuota pagada · quedan ${formatCurrency(data.pendingAmount)} pendientes`
        : "Bono pagado por completo"
    );
    fetchBonuses();
  }

  async function voidBonus(bonus: ContestBonus) {
    const reason = window.prompt(`Motivo para anular el bono de ${bonus.employee.name}:`);
    if (!reason || reason.trim().length < 3) return;
    const res = await fetch(`/api/admin/contest-bonuses/${bonus.id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return toast.error(data?.error?.message ?? "No se pudo anular");
    toast.success("Bono anulado. Lo ya pagado se conserva.");
    fetchBonuses();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <BadgeDollarSign className="w-5 h-5 text-[#C1643F]" />
        <h2 className="text-lg font-heading font-bold text-[#2C1F15]">Bonos generados</h2>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total en bonos", value: formatCurrency(totals.total), color: "#2C1F15" },
          { label: "Pagado", value: formatCurrency(totals.paid), color: "#6B8E6B" },
          { label: "Pendiente de pago", value: formatCurrency(totals.pending), color: "#B94040" },
        ].map((c) => (
          <Card key={c.label} className="shadow-[0_1px_3px_rgba(44,31,21,0.08)]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-[#7A6358]">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold font-mono" style={{ color: c.color }}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-[0_1px_3px_rgba(44,31,21,0.08)]">
        <CardContent className="p-0">
          {loading ? (
            <p className="py-10 text-center text-[#7A6358]">Cargando...</p>
          ) : bonuses.length === 0 ? (
            <p className="py-10 text-center text-[#7A6358]">
              Todavía no se ha adjudicado ningún bono.
            </p>
          ) : (
            <div className="divide-y divide-[#E0D5CA]">
              {bonuses.map((b) => {
                const color = STATUS_COLORS[b.status] ?? STATUS_COLORS.PENDIENTE;
                const pendiente = b.totalAmount - b.paidAmount;
                return (
                  <div key={b.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[#2C1F15]">{b.employee.name}</span>
                          <Badge style={{ backgroundColor: color.bg, color: color.text }} className="border-0 text-xs">
                            {CONTEST_BONUS_STATUS_LABELS[b.status as ContestBonusStatus] ?? b.status}
                          </Badge>
                          {b.employee.active === false && (
                            <Badge className="border-0 text-xs bg-[#F2EDE6] text-[#7A6358]">inactivo</Badge>
                          )}
                        </div>
                        <p className="text-sm text-[#7A6358] mt-0.5">
                          {b.contestName} · {b.itemName}
                        </p>
                        <p className="text-xs text-[#A08878] mt-0.5">
                          Meta {b.goalSnapshot} · resultado {b.resultValue} · {b.percentSnapshot}% sobre{" "}
                          {formatCurrency(b.tipBaseSnapshot)} de propinas ({formatDate(b.periodStart)}–{formatDate(b.periodEnd)})
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-bold text-[#C1643F]">{formatCurrency(b.totalAmount)}</p>
                        {pendiente > 0 && b.status !== "ANULADO" && (
                          <p className="text-xs text-[#B94040] font-mono">
                            pendiente {formatCurrency(pendiente)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {b.payments.map((p) => {
                        const pagada = p.status === "PAGADO";
                        const anulada = p.status === "ANULADO";
                        return (
                          <div key={p.id}
                            className="flex items-center gap-2 rounded-lg border border-[#E0D5CA] bg-[#FAF7F2] px-3 py-2">
                            <div className="text-xs">
                              <p className="text-[#7A6358]">
                                Cuota {p.installment} de {b.payments.length}
                              </p>
                              <p className="font-mono text-[#2C1F15]">
                                {formatCurrency(p.amount)}
                                <span className="text-[#A08878]">
                                  {" "}· {formatDate(p.periodStart)}–{formatDate(p.periodEnd)}
                                </span>
                              </p>
                            </div>
                            {pagada ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[#6B8E6B] font-medium">
                                <Check className="w-3.5 h-3.5" /> pagada
                              </span>
                            ) : anulada ? (
                              <span className="text-xs text-[#B94040]">anulada</span>
                            ) : canPay ? (
                              <Button size="sm" onClick={() => pay(b, p.id, p.amount)}
                                disabled={payingId === p.id}
                                className="h-7 text-xs bg-[#6B8E6B] hover:bg-[#5A7A5A] text-white">
                                {payingId === p.id ? "..." : "Marcar pagada"}
                              </Button>
                            ) : (
                              <span className="text-xs text-[#A08878]">pendiente</span>
                            )}
                          </div>
                        );
                      })}

                      {canAward && b.status !== "ANULADO" && (
                        <Button size="sm" variant="outline" onClick={() => voidBonus(b)}
                          className="h-auto gap-1.5 border-[#B94040] text-[#B94040] hover:bg-[#B94040]/10">
                          <Ban className="w-3.5 h-3.5" /> Anular
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
