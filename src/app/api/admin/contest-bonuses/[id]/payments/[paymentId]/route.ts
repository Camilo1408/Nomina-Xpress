import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { updatePaymentSchema } from "@/lib/contest-validation";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

// PUT — cambiar la quincena destino de una cuota. Solo mientras esté PENDIENTE:
// una cuota pagada es un hecho consumado y su período no se reescribe.
export async function PUT(
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
    include: { contestBonus: { select: { contestName: true, itemName: true } } },
  });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (payment.status !== "PENDIENTE") {
    return NextResponse.json(
      { error: { message: `No se puede reprogramar una cuota ${payment.status}` } },
      { status: 409 }
    );
  }

  const body = await req.json();
  const parsed = updatePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Datos inválidos", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }
  if (parsed.data.periodEnd < parsed.data.periodStart) {
    return NextResponse.json(
      { error: { message: "La fecha de fin no puede ser anterior a la de inicio" } },
      { status: 400 }
    );
  }

  const updated = await prisma.contestBonusPayment.update({
    where: { id: paymentId },
    data: { periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd },
  });

  await logAudit(req, session, {
    action: "UPDATE",
    module: "CONTESTS",
    entityId: paymentId,
    entityLabel: `${payment.contestBonus.contestName} · ${payment.contestBonus.itemName}`,
    description:
      `Reprogramó la cuota ${payment.installment} de la quincena ` +
      `${payment.periodStart}–${payment.periodEnd} a ${updated.periodStart}–${updated.periodEnd}`,
    before: { periodStart: payment.periodStart, periodEnd: payment.periodEnd },
    after: { periodStart: updated.periodStart, periodEnd: updated.periodEnd },
  });

  return NextResponse.json({ payment: updated });
}
