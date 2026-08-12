import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { contestItemInputSchema } from "@/lib/contest-validation";
import { recalculateTipsForRange, validateContestPercentages } from "@/lib/contest-service";
import { isContestConfigEditable, type ContestStatus } from "@/lib/contests";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

// POST — añadir un ítem al concurso.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const contest = await prisma.contest.findFirst({
    where: { id, tenantId },
    include: { items: true },
  });
  if (!contest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isContestConfigEditable(contest.status as ContestStatus)) {
    return NextResponse.json(
      { error: { message: `No se pueden añadir ítems a un concurso ${contest.status}` } },
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

  if (contest.items.some((i) => i.name.toLowerCase() === data.name.toLowerCase())) {
    return NextResponse.json(
      { error: { message: `Ya existe un ítem llamado "${data.name}" en este concurso` } },
      { status: 409 }
    );
  }

  const check = await validateContestPercentages({
    tenantId,
    startDate: contest.startDate,
    endDate: contest.endDate,
    percents: [...contest.items.map((i) => i.percent), data.percent],
    excludeContestId: id,
  });
  if (!check.ok) {
    return NextResponse.json(
      { error: { message: check.error, conflicts: check.conflicts } },
      { status: 400 }
    );
  }

  const item = await prisma.contestItem.create({
    data: {
      tenantId,
      contestId: id,
      name: data.name,
      description: data.description ?? null,
      goalValue: data.goalValue,
      goalUnit: data.goalUnit,
      criteria: data.criteria,
      percent: data.percent,
      winnerMode: data.winnerMode,
    },
  });

  // Si el concurso ya está activo, el ítem empieza a reservar de inmediato sobre
  // los días registrados de su rango.
  let changes: Awaited<ReturnType<typeof recalculateTipsForRange>> = [];
  if (contest.status === "ACTIVO") {
    changes = await recalculateTipsForRange(
      tenantId,
      contest.startDate,
      contest.endDate,
      `Ítem "${item.name}" añadido al concurso "${contest.name}"`
    );
  }

  await logAudit(req, session, {
    action: "CREATE",
    module: "CONTESTS",
    entityId: item.id,
    entityLabel: `${contest.name} · ${item.name}`,
    description:
      `Añadió el ítem "${item.name}" (${item.percent}% de las propinas, meta ${item.goalValue} ${item.goalUnit}) ` +
      `al concurso "${contest.name}"` +
      (changes.length > 0 ? `; se recalcularon ${changes.length} día(s)` : ""),
    after: { ...data, recalculatedDays: changes },
  });

  return NextResponse.json({ item, changes }, { status: 201 });
}
