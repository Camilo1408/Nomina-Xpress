import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { contestItemInputSchema } from "@/lib/contest-validation";
import {
  computeImpactPreview,
  recalculateTipsForRange,
  validateContestPercentages,
} from "@/lib/contest-service";
import { isContestConfigEditable, type ContestStatus } from "@/lib/contests";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

// PUT — editar un ítem. Cambiar su porcentaje en un concurso ACTIVO mueve dinero
// ya repartido, así que exige confirmación informada.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, itemId } = await params;
  const tenantId = session.user.tenantId;

  const item = await prisma.contestItem.findFirst({
    where: { id: itemId, contestId: id, tenantId },
    include: { contest: { include: { items: true } } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contest = item.contest;
  if (!isContestConfigEditable(contest.status as ContestStatus)) {
    return NextResponse.json(
      { error: { message: `No se puede editar un ítem de un concurso ${contest.status}` } },
      { status: 409 }
    );
  }
  if (item.outcome !== "PENDIENTE") {
    return NextResponse.json(
      { error: { message: `El ítem ya fue resuelto (${item.outcome}) y no se puede editar` } },
      { status: 409 }
    );
  }

  const body = await req.json();
  const parsed = contestItemInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Datos inválidos", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const duplicado = contest.items.some(
    (i) => i.id !== itemId && i.name.toLowerCase() === data.name.toLowerCase()
  );
  if (duplicado) {
    return NextResponse.json(
      { error: { message: `Ya existe otro ítem llamado "${data.name}"` } },
      { status: 409 }
    );
  }

  const percentChanged = data.percent !== item.percent;

  if (percentChanged) {
    const check = await validateContestPercentages({
      tenantId,
      startDate: contest.startDate,
      endDate: contest.endDate,
      percents: contest.items.map((i) => (i.id === itemId ? data.percent : i.percent)),
      excludeContestId: id,
    });
    if (!check.ok) {
      return NextResponse.json(
        { error: { message: check.error, conflicts: check.conflicts } },
        { status: 400 }
      );
    }
  }

  if (percentChanged && contest.status === "ACTIVO") {
    const preview = await computeImpactPreview({
      tenantId,
      contestId: id,
      simulated: {
        status: "ACTIVO",
        startDate: contest.startDate,
        endDate: contest.endDate,
        items: contest.items
          .filter((i) => i.outcome === "PENDIENTE")
          .map((i) => ({ id: i.id, percent: i.id === itemId ? data.percent : i.percent })),
      },
    });
    if (preview.error) {
      return NextResponse.json({ error: { message: preview.error } }, { status: 400 });
    }
    if (preview.affectedDays > 0 && body?.confirmImpact !== true) {
      return NextResponse.json(
        {
          error: {
            message:
              `Cambiar el porcentaje de ${item.percent}% a ${data.percent}% recalcula ` +
              `${preview.affectedDays} día(s) de propinas ya repartidas. Revisa el impacto y confirma.`,
            requiresConfirmation: true,
            preview,
          },
        },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.contestItem.update({
    where: { id: itemId },
    data: {
      name: data.name,
      description: data.description ?? null,
      goalValue: data.goalValue,
      goalUnit: data.goalUnit,
      criteria: data.criteria,
      percent: data.percent,
      winnerMode: data.winnerMode,
    },
  });

  let changes: Awaited<ReturnType<typeof recalculateTipsForRange>> = [];
  if (percentChanged && contest.status === "ACTIVO") {
    changes = await recalculateTipsForRange(
      tenantId,
      contest.startDate,
      contest.endDate,
      `Cambio de porcentaje del ítem "${updated.name}" (${item.percent}% → ${data.percent}%)`
    );
  }

  await logAudit(req, session, {
    action: "UPDATE",
    module: "CONTESTS",
    entityId: itemId,
    entityLabel: `${contest.name} · ${updated.name}`,
    description:
      `Editó el ítem "${updated.name}" del concurso "${contest.name}"` +
      (percentChanged ? `: porcentaje ${item.percent}% → ${data.percent}%` : "") +
      (changes.length > 0 ? `; se recalcularon ${changes.length} día(s)` : ""),
    before: {
      name: item.name,
      percent: item.percent,
      goalValue: item.goalValue,
      criteria: item.criteria,
      winnerMode: item.winnerMode,
    },
    after: { ...data, recalculatedDays: changes },
  });

  return NextResponse.json({ item: updated, changes });
}

// DELETE — solo si el ítem no reservó dinero todavía. Si ya reservó, el camino
// correcto es declararlo desierto: devuelve la plata y deja rastro.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, itemId } = await params;
  const tenantId = session.user.tenantId;

  const item = await prisma.contestItem.findFirst({
    where: { id: itemId, contestId: id, tenantId },
    include: { contest: { select: { name: true, status: true } } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isContestConfigEditable(item.contest.status as ContestStatus)) {
    return NextResponse.json(
      { error: { message: `No se puede eliminar un ítem de un concurso ${item.contest.status}` } },
      { status: 409 }
    );
  }

  const reservas = await prisma.contestTipReserve.count({
    where: { tenantId, contestItemId: itemId },
  });
  if (reservas > 0) {
    return NextResponse.json(
      {
        error: {
          message:
            `Este ítem ya reservó dinero en ${reservas} día(s) de propinas. ` +
            `Declararlo desierto devuelve la reserva y conserva el historial; eliminarlo lo borraría.`,
        },
      },
      { status: 409 }
    );
  }

  await prisma.contestItem.delete({ where: { id: itemId } });

  await logAudit(req, session, {
    action: "DELETE",
    module: "CONTESTS",
    entityId: itemId,
    entityLabel: `${item.contest.name} · ${item.name}`,
    description: `Eliminó el ítem "${item.name}" del concurso "${item.contest.name}" (no tenía reservas)`,
    before: item,
  });

  return NextResponse.json({ ok: true });
}
