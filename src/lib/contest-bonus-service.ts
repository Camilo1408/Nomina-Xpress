// Generación y pago de los bonos de concurso.
//
// A diferencia de Bonus/Discount —que son stateless y se recalculan por
// quincena— un bono de concurso se PERSISTE: tiene saldo, cuotas y un estado de
// pago que no se puede derivar de la configuración vigente.

import { prisma } from "@/lib/db";
import {
  bonusStatusFor,
  computeInstallments,
  formatGoalSnapshot,
  resolveWinners,
  splitPrizeAmong,
  type ContestCriteria,
  type ContestResultInput,
  type PayoutMode,
  type ResolveWinnersFailure,
  type WinnerMode,
} from "@/lib/contests";
import { summarizeItemReserves } from "@/lib/contest-service";

// ─── Adjudicación ────────────────────────────────────────────────────────────

export interface AwardedBonus {
  bonusId: string;
  employeeId: string;
  amount: number;
  installments: { installment: number; periodStart: string; periodEnd: string; amount: number }[];
}

export type AwardResult =
  | { ok: true; bonuses: AwardedBonus[]; reservedAmount: number; tipBase: number }
  | {
      ok: false;
      reason: ResolveWinnersFailure | "ESTADO_INVALIDO" | "SIN_RESERVA";
      message: string;
      candidates?: { employeeId: string; value: number }[];
    };

/**
 * Adjudica un ítem: determina el ganador o ganadores, congela los snapshots del
 * concurso en el bono y genera las cuotas de pago.
 *
 * El monto del premio es la suma de las reservas DIARIAS del ítem, no un
 * porcentaje del total del período: es la cifra que efectivamente se descontó a
 * los empleados.
 */
export async function awardContestItem(params: {
  tenantId: string;
  itemId: string;
  manualEmployeeIds?: string[];
  assignedById?: string;
}): Promise<AwardResult> {
  const { tenantId, itemId, manualEmployeeIds, assignedById } = params;

  const item = await prisma.contestItem.findFirst({
    where: { id: itemId, tenantId },
    include: {
      contest: true,
      results: { select: { employeeId: true, value: true, achievedAt: true } },
    },
  });

  if (!item) {
    return { ok: false, reason: "ESTADO_INVALIDO", message: "El ítem no existe" };
  }
  if (item.contest.status !== "FINALIZADO") {
    return {
      ok: false,
      reason: "ESTADO_INVALIDO",
      message: `Solo se puede adjudicar un concurso FINALIZADO (está en ${item.contest.status})`,
    };
  }
  if (item.outcome !== "PENDIENTE") {
    return {
      ok: false,
      reason: "ESTADO_INVALIDO",
      message: `El ítem ya fue resuelto (${item.outcome})`,
    };
  }

  const results: ContestResultInput[] = item.results.map((r) => ({
    employeeId: r.employeeId,
    value: r.value,
    achievedAt: r.achievedAt,
  }));

  const resolution = resolveWinners({
    criteria: item.criteria as ContestCriteria,
    goalValue: item.goalValue,
    winnerMode: item.winnerMode as WinnerMode,
    results,
    manualEmployeeIds,
  });

  if (!resolution.ok) {
    const messages: Record<ResolveWinnersFailure, string> = {
      SIN_CALIFICADOS:
        "Ningún empleado alcanzó la meta. El ítem solo puede declararse desierto.",
      EMPATE:
        "Hay un empate en el primer puesto. Elige manualmente al ganador o cambia el ítem a premio repartido.",
      SELECCION_REQUERIDA: "El criterio es de selección manual: indica a quién premiar.",
      SELECCION_INVALIDA:
        "La selección no es válida: incluye a alguien que no alcanzó la meta, o a varios en un ítem de ganador único.",
    };
    return {
      ok: false,
      reason: resolution.reason,
      message: messages[resolution.reason],
      candidates: resolution.candidates.map((c) => ({
        employeeId: c.employeeId,
        value: c.value,
      })),
    };
  }

  const summary = (await summarizeItemReserves(tenantId, item.contestId)).get(itemId);
  const reservedAmount = summary?.reservedAmount ?? 0;
  const tipBase = summary?.tipBase ?? 0;

  if (reservedAmount <= 0) {
    return {
      ok: false,
      reason: "SIN_RESERVA",
      message:
        "Este ítem no reservó dinero: no hubo propinas registradas en el rango del concurso mientras estuvo activo.",
    };
  }

  const winners = resolution.winners;
  const shares = splitPrizeAmong(reservedAmount, winners.length);
  const goalSnapshot = formatGoalSnapshot(item.goalValue, item.goalUnit);

  const awarded = await prisma.$transaction(async (tx) => {
    const out: AwardedBonus[] = [];

    for (const [i, winner] of winners.entries()) {
      const amount = shares[i];
      const bonus = await tx.contestBonus.create({
        data: {
          tenantId,
          contestId: item.contestId,
          contestItemId: item.id,
          employeeId: winner.employeeId,
          contestName: item.contest.name,
          itemName: item.name,
          goalSnapshot,
          criteriaSnapshot: item.criteria,
          percentSnapshot: item.percent,
          tipBaseSnapshot: tipBase,
          reservedAmount,
          resultValue: winner.value,
          periodStart: item.contest.startDate,
          periodEnd: item.contest.endDate,
          shareRatio: winners.length === 1 ? 1 : amount / reservedAmount,
          totalAmount: amount,
          paidAmount: 0,
          status: "PENDIENTE",
          assignedById,
        },
      });

      const cuotas = computeInstallments(
        amount,
        item.contest.payoutMode as PayoutMode,
        item.contest.endDate
      );

      for (const c of cuotas) {
        await tx.contestBonusPayment.create({
          data: {
            tenantId,
            contestBonusId: bonus.id,
            employeeId: winner.employeeId,
            installment: c.installment,
            periodStart: c.periodStart,
            periodEnd: c.periodEnd,
            amount: c.amount,
            status: "PENDIENTE",
          },
        });
      }

      out.push({
        bonusId: bonus.id,
        employeeId: winner.employeeId,
        amount,
        installments: cuotas,
      });
    }

    await tx.contestItem.update({
      where: { id: item.id },
      data: { outcome: "ADJUDICADO", resolvedAt: new Date(), resolvedById: assignedById },
    });

    return out;
  });

  return { ok: true, bonuses: awarded, reservedAmount, tipBase };
}

// ─── Pago de una cuota ───────────────────────────────────────────────────────

export type PayResult =
  | { ok: true; bonusId: string; paidAmount: number; pendingAmount: number; bonusStatus: string }
  | { ok: false; reason: "NO_ENCONTRADA" | "YA_PAGADA"; message: string };

/**
 * Marca una cuota como pagada. Idempotente por construcción.
 *
 * La condición `status: "PENDIENTE"` va dentro del WHERE del updateMany, no en un
 * `if` previo: de dos peticiones simultáneas solo una obtiene count === 1, y la
 * otra recibe YA_PAGADA. No depende de que la UI deshabilite el botón.
 */
export async function payInstallment(params: {
  tenantId: string;
  paymentId: string;
  paidById?: string;
}): Promise<PayResult> {
  const { tenantId, paymentId, paidById } = params;

  const payment = await prisma.contestBonusPayment.findFirst({
    where: { id: paymentId, tenantId },
    include: { contestBonus: { select: { id: true, totalAmount: true, status: true } } },
  });

  if (!payment) {
    return { ok: false, reason: "NO_ENCONTRADA", message: "La cuota no existe" };
  }
  if (payment.contestBonus.status === "ANULADO") {
    return { ok: false, reason: "YA_PAGADA", message: "El bono está anulado" };
  }

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.contestBonusPayment.updateMany({
      where: { id: paymentId, tenantId, status: "PENDIENTE" },
      data: { status: "PAGADO", paidAt: new Date(), paidById },
    });

    if (count === 0) {
      return {
        ok: false as const,
        reason: "YA_PAGADA" as const,
        message: "Esta cuota ya fue pagada o está anulada",
      };
    }

    const bonus = await tx.contestBonus.findUniqueOrThrow({
      where: { id: payment.contestBonusId },
      select: { totalAmount: true, paidAmount: true },
    });

    const paidAmount = bonus.paidAmount + payment.amount;
    const status = bonusStatusFor(bonus.totalAmount, paidAmount);

    await tx.contestBonus.update({
      where: { id: payment.contestBonusId },
      data: { paidAmount, status },
    });

    return {
      ok: true as const,
      bonusId: payment.contestBonusId,
      paidAmount,
      pendingAmount: bonus.totalAmount - paidAmount,
      bonusStatus: status,
    };
  });
}

// ─── Anulación ───────────────────────────────────────────────────────────────

/**
 * Anula un bono. Las cuotas PENDIENTES pasan a ANULADO; las ya PAGADAS se
 * conservan tal cual, junto con el paidAmount, porque ese dinero ya salió.
 */
export async function voidBonus(params: {
  tenantId: string;
  bonusId: string;
  reason: string;
}): Promise<{ ok: boolean; message?: string; cancelledInstallments?: number }> {
  const { tenantId, bonusId, reason } = params;

  const bonus = await prisma.contestBonus.findFirst({
    where: { id: bonusId, tenantId },
    select: { id: true, status: true },
  });
  if (!bonus) return { ok: false, message: "El bono no existe" };
  if (bonus.status === "ANULADO") return { ok: false, message: "El bono ya está anulado" };

  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.contestBonusPayment.updateMany({
      where: { contestBonusId: bonusId, tenantId, status: "PENDIENTE" },
      data: { status: "ANULADO" },
    });
    await tx.contestBonus.update({
      where: { id: bonusId },
      data: { status: "ANULADO", voidedAt: new Date(), voidReason: reason },
    });
    return count;
  });

  return { ok: true, cancelledInstallments: result };
}

// ─── Cierre del concurso cuando ya no queda nada por pagar ───────────────────

/**
 * Pasa el concurso a PAGADO si todos sus ítems están resueltos y no queda
 * ninguna cuota pendiente. Se llama después de pagar o anular.
 */
export async function settleContestIfComplete(
  tenantId: string,
  contestId: string
): Promise<boolean> {
  const contest = await prisma.contest.findFirst({
    where: { id: contestId, tenantId },
    select: { status: true },
  });
  if (!contest || contest.status !== "FINALIZADO") return false;

  const [pendingItems, pendingPayments] = await Promise.all([
    prisma.contestItem.count({ where: { contestId, tenantId, outcome: "PENDIENTE" } }),
    prisma.contestBonusPayment.count({
      where: { tenantId, contestBonus: { contestId }, status: "PENDIENTE" },
    }),
  ]);

  if (pendingItems > 0 || pendingPayments > 0) return false;

  await prisma.contest.update({ where: { id: contestId }, data: { status: "PAGADO" } });
  return true;
}
