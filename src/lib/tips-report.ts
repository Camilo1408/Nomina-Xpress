// Agregación del reporte de propinas. Función pura (sin Prisma) para que la
// pantalla de Propinas y los reportes PDF/Excel usen exactamente los mismos números.

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
  distributed: number;
  notes: string | null;
  rows: TipsDayRow[];
}

export interface TipsReport {
  totals: { gross: number; menaje: number; distributed: number };
  byEmployee: TipsEmployeeSummary[];
  byDay: TipsDay[];
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

export function aggregateTipsReport(entries: TipEntryInput[]): TipsReport {
  const totals = entries.reduce(
    (acc, e) => ({
      gross: acc.gross + e.totalAmount,
      menaje: acc.menaje + e.menaje,
      distributed: acc.distributed + e.netAmount,
    }),
    { gross: 0, menaje: 0, distributed: 0 }
  );

  const byDay: TipsDay[] = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      date: e.date,
      gross: e.totalAmount,
      menaje: e.menaje,
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

  return { totals, byEmployee: aggregateByEmployee(entries), byDay };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseTipsReportRange(
  params: URLSearchParams
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) return { ok: false, error: "Debes indicar las fechas Desde y Hasta" };
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return { ok: false, error: "Formato de fecha inválido (usa AAAA-MM-DD)" };
  }
  if (from > to) return { ok: false, error: "La fecha Desde no puede ser posterior a Hasta" };
  return { ok: true, from, to };
}
