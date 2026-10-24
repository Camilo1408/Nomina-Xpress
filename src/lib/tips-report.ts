// Agregación del reporte de propinas. Función pura (sin Prisma) para que la
// pantalla de Propinas y los reportes PDF/Excel usen exactamente los mismos números.

import { z } from "zod";
import {
  CONTEST_BONUS_STATUS_LABELS,
  CONTEST_PAYMENT_STATUS_LABELS,
  CONTEST_STATUS_LABELS,
  PAYOUT_MODE_LABELS,
  formatGoalSnapshot,
  type ContestBonusStatus,
  type ContestItemOutcome,
  type ContestPaymentStatus,
  type ContestStatus,
  type PayoutMode,
} from "@/lib/contests";

export interface TipDistributionInput {
  employeeId: string;
  hoursWorked: number;
  tipPercent: number;
  effectiveHours: number;
  amount: number;
  employee: { name: string };
}

export interface TipEntryInput {
  date: string;
  totalAmount: number;
  menaje: number;
  contestReserved: number;
  netAmount: number;
  notes: string | null;
  distributions: TipDistributionInput[];
}

export interface TipsEmployeeSummary {
  employeeId: string;
  employeeName: string;
  totalHours: number;
  avgTipPercent: number;
  totalAmount: number;
}

export interface TipsDayRow {
  employeeName: string;
  hoursWorked: number;
  tipPercent: number;
  effectiveHours: number;
  ratePerHour: number;
  amount: number;
}

export interface TipsDay {
  date: string;
  gross: number;
  menaje: number;
  contestReserved: number;
  distributed: number;
  notes: string | null;
  rows: TipsDayRow[];
}

// ─── Concursos del reporte ───────────────────────────────────────────────────
// Un concurso entra en el reporte de propinas del rango en que TERMINÓ, aunque
// sus premios se paguen en la nómina de la quincena siguiente. Solo cuentan los
// que llegaron a cerrarse (FINALIZADO o PAGADO): uno activo aún no tiene ganador
// y uno cancelado devolvió su reserva al reparto.

export const TIPS_REPORT_CONTEST_STATUSES = ["FINALIZADO", "PAGADO"] as const satisfies readonly ContestStatus[];

export interface ContestBonusPaymentInput {
  installment: number;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: string;
}

export interface ContestBonusInput {
  resultValue: number;
  totalAmount: number;
  status: string;
  employee: { name: string };
  payments: ContestBonusPaymentInput[];
}

export interface ContestItemInput {
  name: string;
  goalValue: number;
  goalUnit: string;
  percent: number;
  outcome: string;
  /** Solo las reservas RESERVADA: las DEVUELTA ya volvieron al reparto. */
  reserves: { amount: number }[];
  bonuses: ContestBonusInput[];
}

export interface ContestInput {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  payoutMode: string;
  items: ContestItemInput[];
}

export interface TipsContestItem {
  name: string;
  goal: string;
  percent: number;
  reserved: number;
  outcomeLabel: string;
}

export interface TipsContestPayment {
  periodStart: string;
  periodEnd: string;
  /** Quincena compacta para el reporte: "16 al 31/08/2026". */
  periodLabel: string;
  amount: number;
  statusLabel: string;
}

export interface TipsContestWinner {
  employeeName: string;
  itemName: string;
  result: string;
  amount: number;
  /** Un bono anulado se lista para que quede constancia, pero no suma al total otorgado. */
  voided: boolean;
  statusLabel: string;
  payments: TipsContestPayment[];
}

export interface TipsContest {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  statusLabel: string;
  payoutLabel: string;
  /** Σ de lo reservado de las propinas en todo el período del concurso. */
  reserved: number;
  /** Σ de los premios adjudicados vigentes (sin los anulados). */
  awarded: number;
  items: TipsContestItem[];
  winners: TipsContestWinner[];
}

export interface TipsReport {
  totals: { gross: number; menaje: number; contestReserved: number; distributed: number };
  byEmployee: TipsEmployeeSummary[];
  byDay: TipsDay[];
  contests: TipsContest[];
}

function aggregateByEmployee(entries: TipEntryInput[]): TipsEmployeeSummary[] {
  const map = new Map<string, { name: string; hours: number; weightedPct: number; amount: number }>();

  for (const entry of entries) {
    for (const d of entry.distributions) {
      const existing = map.get(d.employeeId);
      if (existing) {
        existing.hours += d.hoursWorked;
        existing.weightedPct += d.tipPercent * d.hoursWorked;
        existing.amount += d.amount;
      } else {
        map.set(d.employeeId, {
          name: d.employee.name,
          hours: d.hoursWorked,
          weightedPct: d.tipPercent * d.hoursWorked,
          amount: d.amount,
        });
      }
    }
  }

  return Array.from(map.entries())
    .map(([employeeId, v]) => ({
      employeeId,
      employeeName: v.name,
      totalHours: Math.round(v.hours * 100) / 100,
      avgTipPercent: v.hours > 0 ? Math.round(v.weightedPct / v.hours) : 0,
      totalAmount: Math.round(v.amount),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

const ITEM_OUTCOME_REPORT_LABELS: Record<ContestItemOutcome, string> = {
  PENDIENTE: "Pendiente de adjudicar",
  ADJUDICADO: "Adjudicado",
  DESIERTO: "Desierto — devuelto al reparto",
};

/** "2026-08-16".."2026-08-31" → "16 al 31/08/2026"; si cruza de mes, ambas fechas completas. */
function formatPeriodLabel(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-");
  const [ey, em, ed] = end.split("-");
  if (sy === ey && sm === em) return `${sd} al ${ed}/${em}/${ey}`;
  return `${sd}/${sm}/${sy} al ${ed}/${em}/${ey}`;
}

function aggregateContest(c: ContestInput): TipsContest {
  const items: TipsContestItem[] = c.items.map((i) => ({
    name: i.name,
    goal: formatGoalSnapshot(i.goalValue, i.goalUnit),
    percent: i.percent,
    reserved: i.reserves.reduce((s, r) => s + r.amount, 0),
    outcomeLabel: ITEM_OUTCOME_REPORT_LABELS[i.outcome as ContestItemOutcome] ?? i.outcome,
  }));

  const winners: TipsContestWinner[] = c.items.flatMap((i) =>
    [...i.bonuses]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map((b) => ({
        employeeName: b.employee.name,
        itemName: i.name,
        result: formatGoalSnapshot(b.resultValue, i.goalUnit),
        amount: b.totalAmount,
        voided: b.status === "ANULADO",
        statusLabel: CONTEST_BONUS_STATUS_LABELS[b.status as ContestBonusStatus] ?? b.status,
        payments: [...b.payments]
          .sort((x, y) => x.installment - y.installment)
          .map((p) => ({
            periodStart: p.periodStart,
            periodEnd: p.periodEnd,
            periodLabel: formatPeriodLabel(p.periodStart, p.periodEnd),
            amount: p.amount,
            statusLabel: CONTEST_PAYMENT_STATUS_LABELS[p.status as ContestPaymentStatus] ?? p.status,
          })),
      }))
  );

  return {
    id: c.id,
    name: c.name,
    startDate: c.startDate,
    endDate: c.endDate,
    statusLabel: CONTEST_STATUS_LABELS[c.status as ContestStatus] ?? c.status,
    payoutLabel: PAYOUT_MODE_LABELS[c.payoutMode as PayoutMode] ?? c.payoutMode,
    reserved: items.reduce((s, i) => s + i.reserved, 0),
    awarded: winners.filter((w) => !w.voided).reduce((s, w) => s + w.amount, 0),
    items,
    winners,
  };
}

export function aggregateTipsReport(entries: TipEntryInput[], contests: ContestInput[] = []): TipsReport {
  const totals = entries.reduce(
    (acc, e) => ({
      gross: acc.gross + e.totalAmount,
      menaje: acc.menaje + e.menaje,
      contestReserved: acc.contestReserved + e.contestReserved,
      distributed: acc.distributed + e.netAmount,
    }),
    { gross: 0, menaje: 0, contestReserved: 0, distributed: 0 }
  );

  const byDay: TipsDay[] = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      date: e.date,
      gross: e.totalAmount,
      menaje: e.menaje,
      contestReserved: e.contestReserved,
      distributed: e.netAmount,
      notes: e.notes,
      rows: e.distributions.map((d) => ({
        employeeName: d.employee.name,
        hoursWorked: d.hoursWorked,
        tipPercent: d.tipPercent,
        effectiveHours: d.effectiveHours,
        ratePerHour: d.effectiveHours > 0 ? Math.round(d.amount / d.effectiveHours) : 0,
        amount: d.amount,
      })),
    }));

  const byContest = [...contests]
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name))
    .map(aggregateContest);

  return { totals, byEmployee: aggregateByEmployee(entries), byDay, contests: byContest };
}

export function parseTipsReportRange(
  params: URLSearchParams
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const from = params.get("from");
  const to = params.get("to");

  // First check: missing dates
  if (!from || !to) {
    return { ok: false, error: "Debes indicar las fechas Desde y Hasta" };
  }

  // Zod schema for date format and comparison
  const schema = z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .refine(({ from, to }) => from <= to, {
      message: "comparison_failed",
    });

  const result = schema.safeParse({ from, to });

  if (!result.success) {
    // Distinguish between format error and comparison error
    const hasComparisonError = result.error.issues.some((issue) => issue.code === "custom");

    if (hasComparisonError) {
      return { ok: false, error: "La fecha Desde no puede ser posterior a Hasta" };
    } else {
      return { ok: false, error: "Formato de fecha inválido (usa AAAA-MM-DD)" };
    }
  }

  return { ok: true, from, to };
}
