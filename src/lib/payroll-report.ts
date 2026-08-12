// Carga en bloque de los datos por empleado que alimentan un reporte de nómina
// para el período [from, to]. Reemplaza el patrón N+1 (3 queries por empleado)
// por 3 queries masivas + agrupación en memoria por employeeId.
//
// IMPORTANTE: este helper SOLO obtiene y agrupa datos; NO calcula nada. Cada
// ruta conserva su propio ensamblado (calculatePayroll, propinas, bonos,
// descuentos, finalPay) sin cambios, para no alterar ningún resultado.
//
// Equivalencia de orden: las queries masivas no llevan `orderBy`, igual que las
// per-empleado originales. SQLite/libSQL devuelve filas en orden de rowid; al
// filtrar ese orden global por empleado se conserva el mismo orden relativo que
// una query per-empleado, de modo que los arrays quedan idénticos.

import { prisma } from "@/lib/db";
import type { TimeEntry, PayAdjustment } from "@/generated/prisma";
import type { ContestBonusApplied } from "@/lib/report-types";

export type TipDistributionWithDate = {
  id: string;
  tenantId: string;
  tipEntryId: string;
  employeeId: string;
  hoursWorked: number;
  tipPercent: number;
  effectiveHours: number;
  amount: number;
  createdAt: Date;
  tipEntry: { date: string };
};

/**
 * Cuota de un bono de concurso que cae en el período del reporte.
 *
 * Es un valor INFORMATIVO: se muestra junto a las propinas y, como ellas, no se
 * suma al total de nómina.
 */
export type ContestBonusPaymentForReport = {
  id: string;
  installment: number;
  amount: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  contestBonus: {
    contestName: string;
    itemName: string;
    totalAmount: number;
    goalSnapshot: string;
    resultValue: number;
    /** Todas las cuotas del bono, para poder mostrar "cuota 1 de 2". */
    _count: { payments: number };
  };
};

export interface EmployeePeriodData {
  entries: TimeEntry[];
  adjustments: PayAdjustment[];
  tipDists: TipDistributionWithDate[];
  contestPayments: ContestBonusPaymentForReport[];
}

function emptyBucket(): EmployeePeriodData {
  return { entries: [], adjustments: [], tipDists: [], contestPayments: [] };
}

/**
 * Devuelve un mapa employeeId -> { entries, adjustments, tipDists } con todos los
 * datos del período para los empleados indicados. Cada empleado del arreglo
 * recibido queda presente en el mapa (con buckets vacíos si no tiene datos).
 */
export async function fetchPayrollPeriodData(
  tenantId: string,
  from: string,
  to: string,
  employeeIds: string[]
): Promise<Map<string, EmployeePeriodData>> {
  const map = new Map<string, EmployeePeriodData>();
  for (const id of employeeIds) map.set(id, emptyBucket());

  if (employeeIds.length === 0) return map;

  const [entries, adjustments, tipDists, contestPayments] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { tenantId, employeeId: { in: employeeIds }, date: { gte: from, lte: to } },
    }),
    prisma.payAdjustment.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        periodStart: { gte: from },
        periodEnd: { lte: to },
      },
    }),
    prisma.tipDistribution.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        tipEntry: { date: { gte: from, lte: to } },
      },
      include: { tipEntry: { select: { date: true } } },
    }),
    // Cuotas de bonos de concurso que caen en esta quincena. Mismo criterio de
    // período que payAdjustments. Se excluyen las ANULADO: no representan dinero.
    prisma.contestBonusPayment.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        periodStart: { gte: from },
        periodEnd: { lte: to },
        status: { not: "ANULADO" },
      },
      select: {
        id: true,
        employeeId: true,
        installment: true,
        amount: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        contestBonus: {
          select: {
            contestName: true,
            itemName: true,
            totalAmount: true,
            goalSnapshot: true,
            resultValue: true,
            _count: { select: { payments: true } },
          },
        },
      },
      orderBy: { installment: "asc" },
    }),
  ]);

  for (const e of entries) map.get(e.employeeId)?.entries.push(e);
  for (const a of adjustments) map.get(a.employeeId)?.adjustments.push(a);
  for (const t of tipDists) map.get(t.employeeId)?.tipDists.push(t as TipDistributionWithDate);
  for (const p of contestPayments) map.get(p.employeeId)?.contestPayments.push(p);

  return map;
}

/**
 * Convierte las cuotas de bono en las líneas informativas del reporte.
 *
 * Vive aquí, y no en cada ruta, porque pantalla, PDF y Excel deben mostrar
 * exactamente lo mismo. Tres copias de este mapeo serían tres formas de que los
 * tres reportes acabaran diciendo cosas distintas sobre el mismo dinero.
 */
export function mapContestBonuses(
  payments: ContestBonusPaymentForReport[]
): { contestBonuses: ContestBonusApplied[]; totalContestBonus: number } {
  const contestBonuses: ContestBonusApplied[] = payments.map((p) => ({
    paymentId: p.id,
    contestName: p.contestBonus.contestName,
    itemName: p.contestBonus.itemName,
    goal: p.contestBonus.goalSnapshot,
    resultValue: p.contestBonus.resultValue,
    installment: p.installment,
    totalInstallments: p.contestBonus._count.payments,
    amount: p.amount,
    bonusTotal: p.contestBonus.totalAmount,
    status: p.status,
  }));

  return {
    contestBonuses,
    totalContestBonus: Math.round(contestBonuses.reduce((s, b) => s + b.amount, 0)),
  };
}
