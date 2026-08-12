"use client";

import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AlertTriangle, X } from "lucide-react";
import type { ImpactPreview } from "./types";

/**
 * Diálogo de confirmación informada.
 *
 * Ninguna acción que mueva dinero ya repartido se confirma a ciegas: aquí se ve
 * día por día cuánto cambia el reparto antes de decidir. Es la contrapartida de
 * haber permitido la devolución en cualquier momento.
 */
export function ImpactDialog({
  open,
  title,
  intro,
  preview,
  confirmLabel,
  destructive = false,
  loading = false,
  reason,
  onReasonChange,
  reasonLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  intro: string;
  preview: ImpactPreview | null;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  reason?: string;
  onReasonChange?: (v: string) => void;
  reasonLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const rows = preview?.rows ?? [];
  const total = preview?.totalDelta ?? 0;
  const necesitaMotivo = onReasonChange !== undefined;
  const motivoValido = !necesitaMotivo || (reason ?? "").trim().length >= 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-[#E0D5CA]">
          <div className="flex gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: destructive ? "#B9404015" : "#C1643F15" }}
            >
              <AlertTriangle
                className="w-5 h-5"
                style={{ color: destructive ? "#B94040" : "#C1643F" }}
              />
            </div>
            <div>
              <h2 className="text-lg font-heading font-bold text-[#2C1F15]">{title}</h2>
              <p className="text-sm text-[#7A6358] mt-1">{intro}</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-[#7A6358] hover:text-[#2C1F15]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {preview?.error && (
            <div className="rounded-lg bg-[#B9404010] border border-[#B94040]/30 p-3 text-sm text-[#B94040]">
              {preview.error}
            </div>
          )}

          {rows.length === 0 && !preview?.error && (
            <p className="text-sm text-[#7A6358]">
              No hay propinas registradas que se vean afectadas. Esta acción no cambia
              ningún reparto ya hecho.
            </p>
          )}

          {rows.length > 0 && (
            <>
              <div className="rounded-lg border border-[#E0D5CA] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#F2EDE6]">
                    <tr className="text-left text-xs text-[#7A6358]">
                      <th className="px-3 py-2 font-medium">Día</th>
                      <th className="px-3 py-2 font-medium text-right">Propinas del día</th>
                      <th className="px-3 py-2 font-medium text-right">Se reparte ahora</th>
                      <th className="px-3 py-2 font-medium text-right">Pasará a repartir</th>
                      <th className="px-3 py-2 font-medium text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.date} className="border-t border-[#E0D5CA]">
                        <td className="px-3 py-2 text-[#2C1F15]">{formatDate(r.date)}</td>
                        <td className="px-3 py-2 text-right font-mono text-[#7A6358]">
                          {formatCurrency(r.totalAmount)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[#7A6358]">
                          {formatCurrency(r.netBefore)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[#2C1F15]">
                          {formatCurrency(r.netAfter)}
                        </td>
                        <td
                          className="px-3 py-2 text-right font-mono font-bold"
                          style={{ color: r.delta < 0 ? "#B94040" : "#6B8E6B" }}
                        >
                          {r.delta > 0 ? "+" : ""}
                          {formatCurrency(r.delta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#F2EDE6]">
                    <tr className="border-t-2 border-[#2C1F15]">
                      <td className="px-3 py-2 font-bold text-[#2C1F15]" colSpan={4}>
                        Total que cambia para el personal ({rows.length} día
                        {rows.length === 1 ? "" : "s"})
                      </td>
                      <td
                        className="px-3 py-2 text-right font-mono font-bold"
                        style={{ color: total < 0 ? "#B94040" : "#6B8E6B" }}
                      >
                        {total > 0 ? "+" : ""}
                        {formatCurrency(total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="text-xs text-[#A08878] italic">
                {total < 0
                  ? "Este dinero deja de repartirse entre el personal y queda reservado para el premio."
                  : "Este dinero vuelve al reparto normal entre el personal."}
                {" Si alguna de estas quincenas ya se pagó, un reporte reimpreso dará un resultado distinto al original."}
              </p>
            </>
          )}

          {preview && preview.daysWithoutTips > 0 && (
            <p className="text-xs text-[#7A6358]">
              {preview.daysWithoutTips} día(s) del rango no tienen propinas registradas y no
              se ven afectados.
            </p>
          )}

          {necesitaMotivo && (
            <div>
              <label className="block text-sm font-medium text-[#2C1F15] mb-1.5">
                {reasonLabel ?? "Motivo"}
              </label>
              <input
                type="text"
                value={reason ?? ""}
                onChange={(e) => onReasonChange?.(e.target.value)}
                placeholder="Queda registrado en la auditoría"
                className="w-full h-9 px-3 rounded-md border border-[#E0D5CA] text-sm focus:outline-none focus:ring-2 focus:ring-[#C1643F]/30"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-[#E0D5CA]">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading || !motivoValido || !!preview?.error}
            className={
              destructive
                ? "bg-[#B94040] hover:bg-[#9A3535] text-white"
                : "bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]"
            }
          >
            {loading ? "Procesando..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
