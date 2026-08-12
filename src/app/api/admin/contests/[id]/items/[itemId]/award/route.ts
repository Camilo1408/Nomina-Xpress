import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { awardSchema } from "@/lib/contest-validation";
import { awardContestItem, settleContestIfComplete } from "@/lib/contest-bonus-service";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

/**
 * Adjudica el ítem: determina ganador(es), genera el bono con los snapshots
 * congelados del concurso y crea las cuotas de pago.
 *
 * El monto es la suma de las reservas DIARIAS del ítem, que es lo que realmente
 * se descontó a los empleados — no un porcentaje recalculado sobre el total del
 * período.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_AWARD))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, itemId } = await params;
  const tenantId = session.user.tenantId;

  const item = await prisma.contestItem.findFirst({
    where: { id: itemId, contestId: id, tenantId },
    include: { contest: { select: { name: true } } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = awardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Datos inválidos" } }, { status: 400 });
  }

  const result = await awardContestItem({
    tenantId,
    itemId,
    manualEmployeeIds: parsed.data.manualEmployeeIds,
    assignedById: session.user.id,
  });

  if (!result.ok) {
    const status = result.reason === "ESTADO_INVALIDO" ? 409 : 400;
    return NextResponse.json(
      { error: { message: result.message, reason: result.reason, candidates: result.candidates } },
      { status }
    );
  }

  await settleContestIfComplete(tenantId, id);

  const nombres = await prisma.employee.findMany({
    where: { id: { in: result.bonuses.map((b) => b.employeeId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(nombres.map((n) => [n.id, n.name]));

  await logAudit(req, session, {
    action: "CREATE",
    module: "CONTESTS",
    entityId: itemId,
    entityLabel: `${item.contest.name} · ${item.name}`,
    description:
      `Adjudicó el ítem "${item.name}" a ${result.bonuses
        .map((b) => `${nameById.get(b.employeeId) ?? b.employeeId} (${b.amount})`)
        .join(", ")}. ` +
      `Reserva total ${result.reservedAmount} sobre una base de propinas de ${result.tipBase}.`,
    after: {
      reservedAmount: result.reservedAmount,
      tipBase: result.tipBase,
      bonuses: result.bonuses.map((b) => ({
        employee: nameById.get(b.employeeId) ?? b.employeeId,
        amount: b.amount,
        installments: b.installments,
      })),
    },
  });

  return NextResponse.json({
    ok: true,
    bonuses: result.bonuses.map((b) => ({ ...b, employeeName: nameById.get(b.employeeId) })),
    reservedAmount: result.reservedAmount,
    tipBase: result.tipBase,
  });
}
