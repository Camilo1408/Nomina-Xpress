"use client";

import { useState, useEffect } from "react";
import { formatCurrency, formatHours, formatDate, formatTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, Gift, TrendingDown } from "lucide-react";
import type { BonusApplied } from "@/lib/bonuses";
import type { DiscountApplied } from "@/lib/discounts";

function getCurrentPeriod() {
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

export default function PortalReportPage() {
  const period = getCurrentPeriod();
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [data, setData] = useState<{
    employeeName: string;
    normalHours: number;
    specialHours: number;
    grossPay: number;
    adjustments: { type: string; amount: number; description: string }[];
    netPay: number;
    bonuses: BonusApplied[];
    totalBonuses: number;
    netPayWithBonuses: number;
    discounts: DiscountApplied[];
    totalDiscounts: number;
    netPayWithBonusesAndDiscounts: number;
    entries: { id: string; date: string; checkIn: string; checkOut: string | null; isSpecial: boolean; notes: string | null }[];
  } | null>(null);
  const [tips, setTips] = useState<{ totalTips: number; distributions: { amount: number; tipEntry: { date: string } }[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchReport(f: string, t: string) {
    setLoading(true);
    const [reportRes, tipsRes] = await Promise.all([
      fetch(`/api/employee/report?from=${f}&to=${t}`),
      fetch(`/api/employee/tips?from=${f}&to=${t}`),
    ]);
    if (reportRes.ok) setData(await reportRes.json());
    if (tipsRes.ok) setTips(await tipsRes.json());
    setLoading(false);
  }

  useEffect(() => { fetchReport(from, to); }, [from, to]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Mi Quincena</h1>
        {data && <p className="text-sm text-[#7A6358] mt-1">{data.employeeName}</p>}
      </div>

      <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-3 bg-white rounded-lg border border-[#E0D5CA] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <label className="text-sm text-[#7A6358]">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-[#E0D5CA] rounded-md px-2 py-1.5 text-sm w-full sm:w-auto" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <label className="text-sm text-[#7A6358]">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-[#E0D5CA] rounded-md px-2 py-1.5 text-sm w-full sm:w-auto" />
        </div>
      </div>

      {loading && <p className="text-[#7A6358] text-sm">Cargando...</p>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Horas normales", value: formatHours(data.normalHours), color: "#2C1F15" },
              { label: "Horas especiales", value: formatHours(data.specialHours), color: "#C1643F" },
              { label: "Pago bruto", value: formatCurrency(data.grossPay), color: "#2C1F15" },
              { label: "Pago estimado neto", value: formatCurrency(data.netPay), color: "#6B8E6B" },
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

          {/* Propinas acumuladas */}
          {tips !== null && (
            <div className="bg-white rounded-lg border border-[#C1643F]/30 shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#F2EDE6] bg-[#C1643F]/5 flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#C1643F]" />
                <h3 className="text-sm font-semibold text-[#2C1F15]">
                  Propinas acumuladas — quincena actual
                </h3>
                <span className="ml-auto font-mono font-bold text-[#C1643F]">
                  {formatCurrency(tips.totalTips)}
                </span>
              </div>
              {tips.distributions.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center text-[#7A6358]">
                  No hay propinas registradas en este período.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E0D5CA]">
                      <th className="text-left px-4 py-2 font-medium text-[#7A6358]">Fecha</th>
                      <th className="text-right px-4 py-2 font-medium text-[#7A6358]">Propina</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tips.distributions.map((d, i) => (
                      <tr key={i} className={`border-b border-[#F2EDE6] last:border-0 ${i % 2 === 1 ? "bg-[#F2EDE6]/50" : ""}`}>
                        <td className="px-4 py-2 font-mono text-[#2C1F15]">{formatDate(d.tipEntry.date)}</td>
                        <td className="px-4 py-2 font-mono text-right font-bold text-[#C1643F]">{formatCurrency(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Bonos aplicados en esta quincena */}
          {data.bonuses.length > 0 && (
            <div className="bg-white rounded-lg border border-[#6B8E6B]/30 shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#F2EDE6] bg-[#6B8E6B]/8 flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#6B8E6B]" />
                <h3 className="text-sm font-semibold text-[#2C1F15]">Bonos aplicados en esta quincena</h3>
                <span className="ml-auto font-mono font-bold text-[#6B8E6B]">
                  {formatCurrency(data.totalBonuses)}
                </span>
              </div>
              <div className="divide-y divide-[#F2EDE6]">
                {data.bonuses.map((b) => (
                  <div key={b.bonusId} className="px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[#2C1F15] min-w-0">{b.name}</p>
                    <p className="font-mono font-bold text-[#6B8E6B] flex-shrink-0">+{formatCurrency(b.appliedAmount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Descuentos aplicados en esta quincena */}
          {data.discounts.length > 0 && (
            <div className="bg-white rounded-lg border border-[#B94040]/30 shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#F2EDE6] bg-[#B94040]/8 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-[#B94040]" />
                <h3 className="text-sm font-semibold text-[#2C1F15]">Descuentos aplicados en esta quincena</h3>
                <span className="ml-auto font-mono font-bold text-[#B94040]">
                  −{formatCurrency(data.totalDiscounts)}
                </span>
              </div>
              <div className="divide-y divide-[#F2EDE6]">
                {data.discounts.map((d) => (
                  <div key={d.discountId} className="px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[#2C1F15] min-w-0">{d.name}</p>
                    <p className="font-mono font-bold text-[#B94040] flex-shrink-0">−{formatCurrency(d.appliedAmount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total final con bonos y descuentos */}
          {(data.totalBonuses > 0 || data.totalDiscounts > 0) && (
            <Card className="shadow-[0_1px_3px_rgba(44,31,21,0.08)] border-[#6B8E6B]/40">
              <CardContent className="flex items-center justify-between py-4">
                <span className="text-sm font-medium text-[#7A6358]">Total estimado final</span>
                <span className="text-xl font-bold font-mono text-[#6B8E6B]">{formatCurrency(data.netPayWithBonusesAndDiscounts)}</span>
              </CardContent>
            </Card>
          )}

          {data.adjustments.length > 0 && (
            <div className="bg-white rounded-lg border border-[#E0D5CA] p-4 space-y-2">
              <h3 className="text-sm font-semibold text-[#2C1F15]">Ajustes</h3>
              {data.adjustments.map((adj, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-[#7A6358]">{adj.description}</span>
                  <span className={adj.type === "BONUS" ? "text-[#6B8E6B] font-mono" : "text-[#B94040] font-mono"}>
                    {adj.type === "BONUS" ? "+" : "-"}{formatCurrency(adj.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-x-auto">
            <div className="px-4 py-3 border-b border-[#E0D5CA] bg-[#F2EDE6]">
              <h3 className="text-sm font-semibold text-[#2C1F15]">Mis registros ({data.entries.length})</h3>
            </div>
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-[#E0D5CA]">
                  <th className="text-left px-4 py-2 font-medium text-[#7A6358]">Fecha</th>
                  <th className="text-left px-4 py-2 font-medium text-[#7A6358]">Entrada</th>
                  <th className="text-left px-4 py-2 font-medium text-[#7A6358]">Salida</th>
                  <th className="text-left px-4 py-2 font-medium text-[#7A6358]">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry, i) => (
                  <tr key={entry.id} className={`border-b border-[#F2EDE6] last:border-0 ${i % 2 === 1 ? "bg-[#F2EDE6]/50" : ""}`}>
                    <td className="px-4 py-2 font-mono text-[#2C1F15]">{formatDate(entry.date)}</td>
                    <td className="px-4 py-2 font-mono text-[#2C1F15]">{formatTime(entry.checkIn)}</td>
                    <td className="px-4 py-2 font-mono text-[#2C1F15]">{entry.checkOut ? formatTime(entry.checkOut) : "—"}</td>
                    <td className="px-4 py-2">
                      <Badge className={entry.isSpecial ? "bg-[#C1643F]/10 text-[#C1643F] border-0" : "bg-[#6B8E6B]/10 text-[#6B8E6B] border-0"}>
                        {entry.isSpecial ? "Especial" : "Normal"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {data.entries.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-[#7A6358]">No hay registros en este período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
