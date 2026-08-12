import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Bonos de concurso del empleado en sesión, para la quincena consultada.
 *
 * Informativo, igual que las propinas: no forma parte del pago de nómina.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  const payments = await prisma.contestBonusPayment.findMany({
    where: {
      tenantId: session.user.tenantId,
      employeeId: session.user.employeeId,
      periodStart: { gte: from },
      periodEnd: { lte: to },
      status: { not: "ANULADO" },
    },
    select: {
      id: true,
      installment: true,
      amount: true,
      status: true,
      contestBonus: {
        select: {
          contestName: true,
          itemName: true,
          goalSnapshot: true,
          resultValue: true,
          totalAmount: true,
          _count: { select: { payments: true } },
        },
      },
    },
    orderBy: { installment: "asc" },
  });

  return NextResponse.json({
    bonuses: payments.map((p) => ({
      id: p.id,
      contestName: p.contestBonus.contestName,
      itemName: p.contestBonus.itemName,
      goal: p.contestBonus.goalSnapshot,
      resultValue: p.contestBonus.resultValue,
      installment: p.installment,
      totalInstallments: p.contestBonus._count.payments,
      amount: p.amount,
      bonusTotal: p.contestBonus.totalAmount,
      status: p.status,
    })),
    totalContestBonus: payments.reduce((s, p) => s + p.amount, 0),
  });
}
