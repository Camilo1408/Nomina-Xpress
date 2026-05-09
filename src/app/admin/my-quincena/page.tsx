"use client";

import { useState, useEffect } from "react";
import { formatCurrency, formatHours, formatDate, formatTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

export default function AdminMyQuincenaPage() {
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
    entries: { id: string; date: string; checkIn: string; checkOut: string | null; isSpecial: boolean; notes: string | null }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchReport(f: string, t: string) {
    setLoading(true);
    const res = await fetch(`/api/employee/report?from=${f}&to=${t}`);
    if (res.ok) setData(await res.json());
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
