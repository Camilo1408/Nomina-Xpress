import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { voidItemSchema } from "@/lib/contest-validation";
import { recalculateTipsForRange } from "@/lib/contest-service";
import { settleContestIfComplete } from "@/lib/contest-bonus-service";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

/**
 * Declara un ítem DESIERTO y devuelve su reserva a los empleados.
 *
 * Mismo mecanismo que la cancelación, acotado a un ítem: al marcarlo DESIERTO
 * deja de aparecer en las deducciones del día, sus reservas quedan DEVUELTA y el
 * recálculo reparte de nuevo ese dinero. Los demás ítems del concurso no se tocan.
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
    include: { contest: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (item.outcome !== "PENDIENTE") {
    return NextResponse.json(
      { error: { message: `El ítem ya fue resuelto (${item.outcome})` } },
      { status: 409 }
    );
  }
  if (item.contest.status === "CANCELADO") {
    return NextResponse.json(
      { error: { message: "El concurso está cancelado: su reserva ya se devolvió" } },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = voidItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Datos inválidos", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const antes = await prisma.contestTipReserve.aggregate({
    where: { tenantId, contestItemId: itemId, status: "RESERVADA" },
    _sum: { amount: true },
    _count: { _all: true },
  });

  await prisma.contestItem.update({
    where: { id: itemId },
    data: { outcome: "DESIERTO", resolvedAt: new Date(), resolvedById: session.user.id },
  });

  const changes = await recalculateTipsForRange(
    tenantId,
    item.contest.startDate,
    item.contest.endDate,
    `Ítem "${item.name}" declarado desierto: ${parsed.data.reason}`
  );

  await settleContestIfComplete(tenantId, id);

  const devuelto = changes.reduce((s, c) => s + c.delta, 0);

  await logAudit(req, session, {
    action: "UPDATE",
    module: "CONTESTS",
    entityId: itemId,
    entityLabel: `${item.contest.name} · ${item.name}`,
    description:
      `Declaró desierto el ítem "${item.name}" (${parsed.data.reason}). ` +
      `Se devolvieron ${devuelto} a los empleados recalculando ${changes.length} día(s) de propinas.`,
    before: {
      outcome: "PENDIENTE",
      reservedAmount: antes._sum.amount ?? 0,
      reservedDays: antes._count._all,
    },
    after: { outcome: "DESIERTO", reason: parsed.data.reason, refunded: devuelto, changes },
  });

  return NextResponse.json({ ok: true, outcome: "DESIERTO", refunded: devuelto, changes });
}
