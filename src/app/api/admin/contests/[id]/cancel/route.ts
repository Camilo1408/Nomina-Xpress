import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { cancelSchema } from "@/lib/contest-validation";
import { recalculateTipsForRange } from "@/lib/contest-service";
import { canTransition, type ContestStatus } from "@/lib/contests";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

/**
 * Cancela un concurso y DEVUELVE su reserva a los empleados.
 *
 * El mecanismo es el mismo que usa todo el módulo: se cambia el estado y se
 * recalculan los días del rango. Al dejar de estar ACTIVO, sus ítems ya no
 * aparecen en las deducciones, sus reservas quedan marcadas DEVUELTA y el dinero
 * vuelve al reparto normal. No hay un camino de código aparte para el reembolso.
 *
 * ATENCIÓN — decisión consciente del propietario: esto se permite SIEMPRE, aunque
 * la quincena afectada ya se haya pagado. Un reporte reimpreso de ese período
 * dará distinto al original. Por eso `confirmImpact` es obligatorio y la reserva
 * se marca DEVUELTA en vez de borrarse: la trazabilidad se conserva íntegra.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const contest = await prisma.contest.findFirst({ where: { id, tenantId } });
  if (!contest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canTransition(contest.status as ContestStatus, "CANCELADO")) {
    return NextResponse.json(
      { error: { message: `No se puede cancelar un concurso ${contest.status}` } },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Datos inválidos", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const bonosPagados = await prisma.contestBonus.count({
    where: { tenantId, contestId: id, paidAmount: { gt: 0 } },
  });
  if (bonosPagados > 0) {
    return NextResponse.json(
      {
        error: {
          message:
            `No se puede cancelar: ${bonosPagados} bono(s) de este concurso ya tienen pagos registrados. ` +
            `Anula los bonos primero si de verdad hay que revertirlo.`,
        },
      },
      { status: 409 }
    );
  }

  const antes = await prisma.contestTipReserve.aggregate({
    where: { tenantId, contestId: id, status: "RESERVADA" },
    _sum: { amount: true },
    _count: { _all: true },
  });

  await prisma.contest.update({
    where: { id },
    data: {
      status: "CANCELADO",
      cancelledAt: new Date(),
      cancelledById: session.user.id,
      cancelReason: parsed.data.reason,
    },
  });

  // Anular los bonos que existieran (solo pueden estar sin pagos, ya se verificó).
  const bonos = await prisma.contestBonus.findMany({
    where: { tenantId, contestId: id, status: { not: "ANULADO" } },
    select: { id: true },
  });
  if (bonos.length > 0) {
    const ids = bonos.map((b) => b.id);
    await prisma.$transaction([
      prisma.contestBonusPayment.updateMany({
        where: { contestBonusId: { in: ids }, status: "PENDIENTE" },
        data: { status: "ANULADO" },
      }),
      prisma.contestBonus.updateMany({
        where: { id: { in: ids } },
        data: {
          status: "ANULADO",
          voidedAt: new Date(),
          voidReason: `Concurso cancelado: ${parsed.data.reason}`,
        },
      }),
    ]);
  }

  const changes = await recalculateTipsForRange(
    tenantId,
    contest.startDate,
    contest.endDate,
    `Cancelación del concurso "${contest.name}": ${parsed.data.reason}`
  );

  const devuelto = changes.reduce((s, c) => s + c.delta, 0);

  await logAudit(req, session, {
    action: "UPDATE",
    module: "CONTESTS",
    entityId: id,
    entityLabel: contest.name,
    description:
      `Canceló el concurso "${contest.name}" (${parsed.data.reason}). ` +
      `Se devolvieron ${devuelto} a los empleados recalculando ${changes.length} día(s) de propinas` +
      (bonos.length > 0 ? `; se anularon ${bonos.length} bono(s)` : ""),
    before: {
      status: contest.status,
      reservedAmount: antes._sum.amount ?? 0,
      reservedDays: antes._count._all,
    },
    after: {
      status: "CANCELADO",
      reason: parsed.data.reason,
      refunded: devuelto,
      recalculatedDays: changes,
      voidedBonuses: bonos.length,
    },
  });

  return NextResponse.json({
    ok: true,
    status: "CANCELADO",
    refunded: devuelto,
    changes,
    voidedBonuses: bonos.length,
  });
}
