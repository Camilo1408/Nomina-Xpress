import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { payInstallment, settleContestIfComplete } from "@/lib/contest-bonus-service";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

/**
 * Marca una cuota como pagada.
 *
 * Idempotente: la condición `status: PENDIENTE` vive dentro del WHERE del
 * updateMany, no en un `if` previo. De dos peticiones simultáneas solo una
 * obtiene count === 1; la otra recibe 409. No depende de que la UI deshabilite
 * el botón.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_PAY))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, paymentId } = await params;
  const tenantId = session.user.tenantId;

  const payment = await prisma.contestBonusPayment.findFirst({
    where: { id: paymentId, contestBonusId: id, tenantId },
    include: {
      contestBonus: {
        select: {
          contestId: true,
          contestName: true,
          itemName: true,
          employee: { select: { name: true } },
        },
      },
    },
  });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await payInstallment({ tenantId, paymentId, paidById: session.user.id });

  if (!result.ok) {
    await logAudit(req, session, {
      action: "PAYMENT",
      module: "CONTESTS",
      entityId: paymentId,
      entityLabel: `${payment.contestBonus.contestName} · ${payment.contestBonus.itemName}`,
      description: `Intento rechazado de pagar la cuota ${payment.installment}: ${result.message}`,
      result: "FAILURE",
    });
    return NextResponse.json(
      { error: { message: result.message, reason: result.reason } },
      { status: result.reason === "NO_ENCONTRADA" ? 404 : 409 }
    );
  }

  const contestSettled = await settleContestIfComplete(tenantId, payment.contestBonus.contestId);

  await logAudit(req, session, {
    action: "PAYMENT",
    module: "CONTESTS",
    entityId: paymentId,
    entityLabel: `${payment.contestBonus.contestName} · ${payment.contestBonus.itemName}`,
    description:
      `Pagó la cuota ${payment.installment} del bono de ${payment.contestBonus.employee.name} ` +
      `por ${payment.amount} en la quincena ${payment.periodStart} a ${payment.periodEnd}. ` +
      `Saldo pendiente: ${result.pendingAmount}.`,
    after: {
      installment: payment.installment,
      amount: payment.amount,
      periodStart: payment.periodStart,
      periodEnd: payment.periodEnd,
      paidAmount: result.paidAmount,
      pendingAmount: result.pendingAmount,
      bonusStatus: result.bonusStatus,
    },
  });

  return NextResponse.json({ ...result, contestSettled });
}
