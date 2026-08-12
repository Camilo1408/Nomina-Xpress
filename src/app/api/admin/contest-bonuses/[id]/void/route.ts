import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { voidBonusSchema } from "@/lib/contest-validation";
import { settleContestIfComplete, voidBonus } from "@/lib/contest-bonus-service";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

/**
 * Anula un bono. Las cuotas PENDIENTES se anulan; las ya PAGADAS se conservan,
 * igual que el paidAmount: ese dinero salió y el histórico no se reescribe.
 *
 * Anular NO devuelve la reserva a las propinas. Para eso está declarar el ítem
 * desierto o cancelar el concurso.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_AWARD))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const bonus = await prisma.contestBonus.findFirst({
    where: { id, tenantId },
    include: { employee: { select: { name: true } } },
  });
  if (!bonus) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = voidBonusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Datos inválidos", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const result = await voidBonus({ tenantId, bonusId: id, reason: parsed.data.reason });
  if (!result.ok) {
    return NextResponse.json({ error: { message: result.message } }, { status: 409 });
  }

  await settleContestIfComplete(tenantId, bonus.contestId);

  await logAudit(req, session, {
    action: "UPDATE",
    module: "CONTESTS",
    entityId: id,
    entityLabel: `${bonus.contestName} · ${bonus.itemName}`,
    description:
      `Anuló el bono de ${bonus.employee.name} por ${bonus.totalAmount} ` +
      `(${parsed.data.reason}). Se anularon ${result.cancelledInstallments} cuota(s) pendiente(s); ` +
      `los ${bonus.paidAmount} ya pagados se conservan.`,
    before: { status: bonus.status, paidAmount: bonus.paidAmount },
    after: {
      status: "ANULADO",
      reason: parsed.data.reason,
      cancelledInstallments: result.cancelledInstallments,
    },
  });

  return NextResponse.json({ ok: true, cancelledInstallments: result.cancelledInstallments });
}
