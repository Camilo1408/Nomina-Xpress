import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { canTransition, type ContestStatus } from "@/lib/contests";
import { todayColombia } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

/**
 * Finaliza un concurso: CONGELA su reserva.
 *
 * A partir de aquí, un TipEntry nuevo o editado dentro del rango ya no crea
 * reservas para este concurso, y las que existen conservan su monto aunque se
 * corrijan las horas o el total de ese día. Es lo que garantiza que el bono se
 * calcule sobre una base que no se puede mover después.
 *
 * Finalizar antes de la fecha de fin está permitido: congela con lo acumulado
 * hasta ese momento. Se exige `confirmEarly` para que sea una decisión y no un
 * clic descuidado.
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

  if (!canTransition(contest.status as ContestStatus, "FINALIZADO")) {
    return NextResponse.json(
      { error: { message: `No se puede finalizar un concurso ${contest.status}` } },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const hoy = todayColombia();
  const anticipada = hoy <= contest.endDate;

  if (anticipada && body?.confirmEarly !== true) {
    const reservado = await prisma.contestTipReserve.aggregate({
      where: { tenantId, contestId: id, status: "RESERVADA" },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return NextResponse.json(
      {
        error: {
          message:
            `El concurso termina el ${contest.endDate} y hoy es ${hoy}. ` +
            `Si lo finalizas ahora, los días restantes ya no reservarán y el premio queda ` +
            `congelado en ${reservado._sum.amount ?? 0} sobre ${reservado._count._all} día(s).`,
          requiresConfirmation: true,
          earlyFinalize: true,
          reservedAmount: reservado._sum.amount ?? 0,
          reservedDays: reservado._count._all,
        },
      },
      { status: 409 }
    );
  }

  await prisma.contest.update({
    where: { id },
    data: { status: "FINALIZADO", finalizedAt: new Date(), finalizedById: session.user.id },
  });

  const resumen = await prisma.contestTipReserve.aggregate({
    where: { tenantId, contestId: id, status: "RESERVADA" },
    _sum: { amount: true, tipTotalAmount: true },
    _count: { _all: true },
  });

  await logAudit(req, session, {
    action: "UPDATE",
    module: "CONTESTS",
    entityId: id,
    entityLabel: contest.name,
    description:
      `Finalizó el concurso "${contest.name}"${anticipada ? " de forma anticipada" : ""}. ` +
      `Reserva congelada: ${resumen._sum.amount ?? 0} sobre una base de propinas de ` +
      `${resumen._sum.tipTotalAmount ?? 0} en ${resumen._count._all} día(s).`,
    before: { status: contest.status },
    after: {
      status: "FINALIZADO",
      anticipada,
      reservedAmount: resumen._sum.amount ?? 0,
      tipBase: resumen._sum.tipTotalAmount ?? 0,
      days: resumen._count._all,
    },
  });

  return NextResponse.json({
    ok: true,
    status: "FINALIZADO",
    reservedAmount: resumen._sum.amount ?? 0,
    tipBase: resumen._sum.tipTotalAmount ?? 0,
    days: resumen._count._all,
  });
}
