"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CONTEST_ITEM_OUTCOME_LABELS,
  CONTEST_STATUS_LABELS,
  PAYOUT_MODE_LABELS,
  type ContestItemOutcome,
  type ContestStatus,
  type PayoutMode,
} from "@/lib/contests";
import {
  ChevronDown,
  ChevronRight,
  Ban,
  Play,
  Plus,
  Flag,
  Trophy,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ContestModal } from "./ContestModal";
import { ImpactDialog } from "./ImpactDialog";
import { ResultsModal } from "./ResultsModal";
import { ContestBonusesPanel } from "./ContestBonusesPanel";
import type { Contest, ContestItem, ImpactPreview } from "./types";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  BORRADOR: { bg: "#F2EDE6", text: "#7A6358" },
  PROGRAMADO: { bg: "#E8EEF5", text: "#4A6B8A" },
  ACTIVO: { bg: "#E9F1E9", text: "#4F7A4F" },
  FINALIZADO: { bg: "#FDF0E6", text: "#A8522F" },
  PAGADO: { bg: "#E9F1E9", text: "#3F6B3F" },
  CANCELADO: { bg: "#F7E9E9", text: "#B94040" },
};

const OUTCOME_COLORS: Record<string, string> = {
  PENDIENTE: "#7A6358",
  ADJUDICADO: "#4F7A4F",
  DESIERTO: "#B94040",
};

type PendingAction =
  | { kind: "activate"; contest: Contest }
  | { kind: "cancel"; contest: Contest }
  | { kind: "void"; contest: Contest; item: ContestItem };

export function ContestsClient({
  canCreate,
  canEdit,
  canDelete,
  canAward,
  canPay,
}: {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAward: boolean;
  canPay: boolean;
}) {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [resultsFor, setResultsFor] = useState<{ contest: Contest; item: ContestItem } | null>(null);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [preview, setPreview] = useState<ImpactPreview | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const [finalizeTarget, setFinalizeTarget] = useState<{ contest: Contest; message: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Contest | null>(null);

  // La recarga se dispara subiendo reloadKey, y el estado se actualiza DENTRO
  // del efecto tras el await, con guarda de cancelación. Así no hay setState
  // síncrono en el cuerpo del efecto ni respuestas de peticiones obsoletas.
  const [reloadKey, setReloadKey] = useState(0);
  const fetchContests = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const res = await fetch("/api/admin/contests");
      const data = await res.json().catch(() => null);
      if (cancelado) return;
      setContests(data?.contests ?? []);
      setLoading(false);
    })();
    return () => { cancelado = true; };
  }, [reloadKey]);

  function toggle(id: string) {
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function openImpact(action: PendingAction) {
    setPending(action);
    setReason("");
    setPreview(null);
    const accion = action.kind === "activate" ? "activar" : "cancelar";
    const res = await fetch(`/api/admin/contests/${action.contest.id}/impact?action=${accion}`);
    const data = await res.json().catch(() => null);
    setPreview(data?.preview ?? null);
  }

  async function confirmAction() {
    if (!pending) return;
    setBusy(true);
    let res: Response;

    if (pending.kind === "activate") {
      res = await fetch(`/api/admin/contests/${pending.contest.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmImpact: true }),
      });
    } else if (pending.kind === "cancel") {
      res = await fetch(`/api/admin/contests/${pending.contest.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, confirmImpact: true }),
      });
    } else {
      res = await fetch(
        `/api/admin/contests/${pending.contest.id}/items/${pending.item.id}/void`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, confirmImpact: true }),
        }
      );
    }

    setBusy(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error?.message ?? "No se pudo completar la acción");
      return;
    }

    const mensajes: Record<PendingAction["kind"], string> = {
      activate: `Concurso activado${data?.changes?.length ? ` · ${data.changes.length} día(s) de propinas recalculados` : ""}`,
      cancel: `Concurso cancelado · se devolvieron ${formatCurrency(data?.refunded ?? 0)} al personal`,
      void: `Ítem declarado desierto · se devolvieron ${formatCurrency(data?.refunded ?? 0)} al personal`,
    };
    toast.success(mensajes[pending.kind]);
    setPending(null);
    fetchContests();
  }

  async function finalize(contest: Contest, confirmEarly = false) {
    const res = await fetch(`/api/admin/contests/${contest.id}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEarly }),
    });
    const data = await res.json().catch(() => null);

    if (res.status === 409 && data?.error?.earlyFinalize) {
      setFinalizeTarget({ contest, message: data.error.message });
      return;
    }
    if (!res.ok) return toast.error(data?.error?.message ?? "No se pudo finalizar");
    toast.success(
      `Concurso finalizado · premio congelado en ${formatCurrency(data?.reservedAmount ?? 0)}`
    );
    fetchContests();
  }

  async function confirmFinalizeEarly() {
    if (!finalizeTarget) return;
    const contest = finalizeTarget.contest;
    setFinalizeTarget(null);
    return finalize(contest, true);
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    const contest = removeTarget;
    setRemoveTarget(null);
    const res = await fetch(`/api/admin/contests/${contest.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) return toast.error(data?.error?.message ?? "No se pudo eliminar");
    toast.success("Borrador eliminado");
    fetchContests();
  }

  const activos = contests.filter((c) => c.status === "ACTIVO");
  const reservadoTotal = contests.reduce(
    (s, c) => s + c.items.reduce((si, i) => si + (i.reserve?.reservedAmount ?? 0), 0),
    0
  );
  const porcentajeActivo = activos.reduce(
    (s, c) => s + c.items.filter((i) => i.outcome === "PENDIENTE").reduce((si, i) => si + i.percent, 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1 min-w-[280px]">
          {[
            { label: "Concursos activos", value: String(activos.length), color: "#2C1F15" },
            {
              label: "% adicional sobre propinas",
              value: `${Math.round(porcentajeActivo * 100) / 100}%`,
              color: "#B94040",
            },
            { label: "Dinero reservado", value: formatCurrency(reservadoTotal), color: "#C1643F" },
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
        {canCreate && (
          <Button
            onClick={() => setShowCreate(true)}
            className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-1.5"
          >
            <Plus className="w-4 h-4" /> Nuevo concurso
          </Button>
        )}
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-[#7A6358]">Cargando...</CardContent></Card>
      ) : contests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="w-8 h-8 text-[#E0D5CA] mx-auto mb-3" />
            <p className="text-[#7A6358]">No hay concursos todavía.</p>
            <p className="text-sm text-[#A08878] mt-1">
              Un concurso reserva un porcentaje extra de las propinas para premiar a quien cumpla una meta.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contests.map((c) => {
            const isOpen = expanded.has(c.id);
            const color = STATUS_COLORS[c.status] ?? STATUS_COLORS.BORRADOR;
            const totalPct = c.items.reduce((s, i) => s + i.percent, 0);
            const reservado = c.items.reduce((s, i) => s + (i.reserve?.reservedAmount ?? 0), 0);

            return (
              <Card key={c.id} className="shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-hidden">
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer hover:bg-[#FAF7F2]"
                  onClick={() => toggle(c.id)}
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-[#7A6358] mt-1 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[#7A6358] mt-1 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading font-bold text-[#2C1F15]">{c.name}</h3>
                      <Badge
                        style={{ backgroundColor: color.bg, color: color.text }}
                        className="border-0 text-xs"
                      >
                        {CONTEST_STATUS_LABELS[c.status as ContestStatus] ?? c.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-[#7A6358] mt-1">
                      {formatDate(c.startDate)} – {formatDate(c.endDate)} ·{" "}
                      {c.items.length} ítem{c.items.length === 1 ? "" : "s"} ·{" "}
                      <span className="text-[#B94040]">{Math.round(totalPct * 100) / 100}% de las propinas</span>
                    </p>
                    <p className="text-xs text-[#A08878] mt-0.5">
                      {PAYOUT_MODE_LABELS[c.payoutMode as PayoutMode]}
                      {c.cancelReason ? ` · Cancelado: ${c.cancelReason}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-[#7A6358]">Reservado</p>
                    <p className="font-mono font-bold text-[#C1643F]">{formatCurrency(reservado)}</p>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-[#E0D5CA] bg-[#FAF7F2] p-4 space-y-4">
                    <div className="rounded-lg border border-[#E0D5CA] bg-white overflow-x-auto">
                      <table className="w-full text-sm min-w-[640px]">
                        <thead className="bg-[#F2EDE6]">
                          <tr className="text-left text-xs text-[#7A6358]">
                            <th className="px-3 py-2 font-medium">Ítem</th>
                            <th className="px-3 py-2 font-medium">Meta</th>
                            <th className="px-3 py-2 font-medium text-right">%</th>
                            <th className="px-3 py-2 font-medium text-right">Reservado</th>
                            <th className="px-3 py-2 font-medium">Estado</th>
                            <th className="px-3 py-2 font-medium text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.items.map((i) => (
                            <tr key={i.id} className="border-t border-[#E0D5CA]">
                              <td className="px-3 py-2 text-[#2C1F15]">{i.name}</td>
                              <td className="px-3 py-2 text-[#7A6358]">
                                {i.goalValue} {i.goalUnit}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-[#B94040]">{i.percent}%</td>
                              <td className="px-3 py-2 text-right font-mono text-[#C1643F]">
                                {formatCurrency(i.reserve?.reservedAmount ?? 0)}
                                <span className="text-[#A08878] text-xs"> · {i.reserve?.days ?? 0}d</span>
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className="text-xs font-medium"
                                  style={{ color: OUTCOME_COLORS[i.outcome] }}
                                >
                                  {CONTEST_ITEM_OUTCOME_LABELS[i.outcome as ContestItemOutcome] ?? i.outcome}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setResultsFor({ contest: c, item: i })}
                                    className="h-7 text-xs"
                                  >
                                    {i.outcome === "PENDIENTE" ? "Resultados" : "Ver"}
                                  </Button>
                                  {canAward && i.outcome === "PENDIENTE" && c.status !== "CANCELADO" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => { setPending({ kind: "void", contest: c, item: i }); setReason(""); setPreview(null); }}
                                      className="h-7 text-xs border-[#B94040] text-[#B94040] hover:bg-[#B94040]/10"
                                    >
                                      Desierto
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {canEdit && (c.status === "BORRADOR" || c.status === "PROGRAMADO") && (
                        <Button size="sm" onClick={() => openImpact({ kind: "activate", contest: c })}
                          className="bg-[#6B8E6B] hover:bg-[#5A7A5A] text-white gap-1.5">
                          <Play className="w-3.5 h-3.5" /> Activar
                        </Button>
                      )}
                      {canEdit && c.status === "ACTIVO" && (
                        <Button size="sm" onClick={() => finalize(c)}
                          className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-1.5">
                          <Flag className="w-3.5 h-3.5" /> Finalizar y congelar
                        </Button>
                      )}
                      {canEdit && ["BORRADOR", "PROGRAMADO", "ACTIVO", "FINALIZADO"].includes(c.status) && (
                        <Button size="sm" variant="outline"
                          onClick={() => openImpact({ kind: "cancel", contest: c })}
                          className="gap-1.5 border-[#B94040] text-[#B94040] hover:bg-[#B94040]/10">
                          <Ban className="w-3.5 h-3.5" /> Cancelar y devolver
                        </Button>
                      )}
                      {canDelete && c.status === "BORRADOR" && (
                        <Button size="sm" variant="outline" onClick={() => setRemoveTarget(c)}
                          className="gap-1.5 border-[#B94040] text-[#B94040] hover:bg-[#B94040]/10">
                          <Trash2 className="w-3.5 h-3.5" /> Eliminar borrador
                        </Button>
                      )}
                    </div>

                    {c.status === "FINALIZADO" && (
                      <p className="text-xs text-[#A08878] italic">
                        Concurso congelado: las propinas de su rango ya no cambian su reserva,
                        aunque se corrijan horas o totales.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ContestBonusesPanel canPay={canPay} canAward={canAward} refreshKey={contests.length} />

      {showCreate && (
        <ContestModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); fetchContests(); }}
        />
      )}

      {resultsFor && (
        <ResultsModal
          contestId={resultsFor.contest.id}
          item={resultsFor.item}
          contestStatus={resultsFor.contest.status}
          canAward={canAward}
          onClose={() => setResultsFor(null)}
          onSaved={fetchContests}
        />
      )}

      <ImpactDialog
        open={pending !== null}
        title={
          pending?.kind === "activate" ? "Activar el concurso"
            : pending?.kind === "cancel" ? "Cancelar el concurso y devolver el dinero"
            : "Declarar el ítem desierto"
        }
        intro={
          pending?.kind === "activate"
            ? "A partir de ahora este concurso descontará su porcentaje de las propinas. Los días ya registrados del rango se recalculan."
            : pending?.kind === "cancel"
            ? "La reserva vuelve al reparto del personal. Las reservas quedan marcadas como devueltas, no se borran."
            : `Los ${formatCurrency(pending?.item.reserve?.reservedAmount ?? 0)} reservados para "${pending?.item.name}" vuelven al reparto del personal. Los demás ítems del concurso no se tocan.`
        }
        preview={preview}
        destructive={pending?.kind !== "activate"}
        loading={busy}
        confirmLabel={
          pending?.kind === "activate" ? "Activar" : pending?.kind === "cancel" ? "Cancelar concurso" : "Declarar desierto"
        }
        reason={pending?.kind === "activate" ? undefined : reason}
        onReasonChange={pending?.kind === "activate" ? undefined : setReason}
        reasonLabel="Motivo (queda en la auditoría)"
        onConfirm={confirmAction}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={finalizeTarget !== null}
        variant="warning"
        title="Finalizar antes de tiempo"
        description={finalizeTarget?.message ?? ""}
        confirmLabel="Finalizar de todos modos"
        onConfirm={confirmFinalizeEarly}
        onCancel={() => setFinalizeTarget(null)}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        title="Eliminar borrador"
        description={removeTarget ? `¿Eliminar el borrador "${removeTarget.name}"? Esta acción no se puede deshacer.` : ""}
        confirmLabel="Eliminar"
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
