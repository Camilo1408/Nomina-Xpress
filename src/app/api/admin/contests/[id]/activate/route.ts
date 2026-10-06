import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { activateSchema } from "@/lib/contest-validation";
import {
  computeImpactPreview,
  recalculateTipsForRange,
  validateContestPercentages,
} from "@/lib/contest-service";
import { canTransition, type ContestStatus } from "@/lib/contests";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

/**
 * Activa un concurso. Es el momento en que empieza a descontar propinas.
 *
 * Si dentro del rango ya hay días con propinas registradas, se recalculan para
 * crear sus reservas: el dinero sale del reparto de los empleados. Como eso
 * modifica montos que ya se mostraron, exige confirmación informada — el cliente
 * debe haber consultado /impact y enviar confirmImpact.
 *
 * Un concurso en BORRADOR se promueve a PROGRAMADO y de ahí a ACTIVO en la misma
 * llamada: para el usuario "activar" es una sola acción.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const contest = await prisma.contest.findFirst({
    where: { id, tenantId },
    include: { items: { select: { id: true, percent: true, outcome: true } } },
  });
  if (!contest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const status = contest.status as ContestStatus;
  if (status === "ACTIVO") {
    return NextResponse.json(
      { error: { message: "El concurso ya está activo" } },
      { status: 409 }
    );
  }
  const viaProgramado = status === "BORRADOR";
  const puede = viaProgramado
    ? canTransition("BORRADOR", "PROGRAMADO") && canTransition("PROGRAMADO", "ACTIVO")
    : canTransition(status, "ACTIVO");
  if (!puede) {
    return NextResponse.json(
      { error: { message: `No se puede activar un concurso ${status}` } },
      { status: 409 }
    );
  }

  if (contest.items.length === 0) {
    return NextResponse.json(
      { error: { message: "El concurso no tiene ítems: no hay nada que reservar" } },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = activateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Datos inválidos" } }, { status: 400 });
  }

  const pendientes = contest.items.filter((i) => i.outcome === "PENDIENTE");

  // Revalidar el tope: entre la creación y la activación pudo activarse otro
  // concurso que solape.
  const check = await validateContestPercentages({
    tenantId,
    startDate: contest.startDate,
    endDate: contest.endDate,
    percents: pendientes.map((i) => i.percent),
    excludeContestId: id,
  });
  if (!check.ok) {
    return NextResponse.json(
      { error: { message: check.error, conflicts: check.conflicts } },
      { status: 400 }
    );
  }

  const preview = await computeImpactPreview({
    tenantId,
    contestId: id,
    simulated: {
      status: "ACTIVO",
      startDate: contest.startDate,
      endDate: contest.endDate,
      items: pendientes.map((i) => ({ id: i.id, percent: i.percent })),
    },
  });

  if (preview.error) {
    return NextResponse.json({ error: { message: preview.error } }, { status: 400 });
  }

  if (preview.affectedDays > 0 && !parsed.data.confirmImpact) {
    return NextResponse.json(
      {
        error: {
          message:
            `Activar este concurso recalcula ${preview.affectedDays} día(s) de propinas ya registrados ` +
            `y reduce en ${Math.abs(preview.totalDelta)} el dinero repartido. Revisa el impacto y confirma.`,
          requiresConfirmation: true,
          preview,
        },
      },
      { status: 409 }
    );
  }

  await prisma.contest.update({
    where: { id },
    data: { status: "ACTIVO", activatedAt: new Date(), activatedById: session.user.id },
  });

  const changes = await recalculateTipsForRange(
    tenantId,
    contest.startDate,
    contest.endDate,
    `Activación del concurso "${contest.name}"`
  );

  await logAudit(req, session, {
    action: "ACTIVATE",
    module: "CONTESTS",
    entityId: id,
    entityLabel: contest.name,
    description:
      `Activó el concurso "${contest.name}"` +
      (changes.length > 0
        ? `; se recalcularon ${changes.length} día(s) de propinas ya registrados`
        : " (sin días registrados en el rango todavía)"),
    before: { status: contest.status },
    after: { status: "ACTIVO", recalculatedDays: changes },
  });

  return NextResponse.json({ ok: true, status: "ACTIVO", changes });
}
