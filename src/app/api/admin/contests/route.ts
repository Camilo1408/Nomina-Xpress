import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { contestInputSchema } from "@/lib/contest-validation";
import { validateContestPercentages, summarizeItemReserves } from "@/lib/contest-service";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

// GET — concursos del tenant, con ítems y lo reservado por cada uno.
export async function GET(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const contests = await prisma.contest.findMany({
    where: { tenantId, ...(status ? { status } : {}) },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          _count: { select: { results: true, bonuses: true } },
        },
      },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });

  // Reserva acumulada por ítem, para mostrar el premio en juego sin N+1.
  const reserves = await prisma.contestTipReserve.groupBy({
    by: ["contestItemId"],
    where: { tenantId, status: "RESERVADA" },
    _sum: { amount: true, tipTotalAmount: true },
    _count: { _all: true },
  });
  const byItem = new Map(
    reserves.map((r) => [
      r.contestItemId,
      {
        reservedAmount: r._sum.amount ?? 0,
        tipBase: r._sum.tipTotalAmount ?? 0,
        days: r._count._all,
      },
    ])
  );

  return NextResponse.json({
    contests: contests.map((c) => ({
      ...c,
      items: c.items.map((i) => ({
        ...i,
        reserve: byItem.get(i.id) ?? { reservedAmount: 0, tipBase: 0, days: 0 },
      })),
    })),
  });
}

// POST — crear concurso con sus ítems. Nace en BORRADOR: no reserva nada hasta
// que alguien lo active explícitamente.
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_CREATE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = contestInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Datos inválidos", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const tenantId = session.user.tenantId;

  // Tope acumulado día a día contra los concursos ACTIVO y PROGRAMADO que se
  // solapen con este rango.
  const check = await validateContestPercentages({
    tenantId,
    startDate: data.startDate,
    endDate: data.endDate,
    percents: data.items.map((i) => i.percent),
  });
  if (!check.ok) {
    return NextResponse.json(
      { error: { message: check.error, conflicts: check.conflicts } },
      { status: 400 }
    );
  }

  const contest = await prisma.contest.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description ?? null,
      startDate: data.startDate,
      endDate: data.endDate,
      payoutMode: data.payoutMode,
      status: "BORRADOR",
      createdById: session.user.id,
      items: {
        create: data.items.map((i) => ({
          tenantId,
          name: i.name,
          description: i.description ?? null,
          goalValue: i.goalValue,
          goalUnit: i.goalUnit,
          criteria: i.criteria,
          percent: i.percent,
          winnerMode: i.winnerMode,
        })),
      },
    },
    include: { items: true },
  });

  const totalPercent = data.items.reduce((s, i) => s + i.percent, 0);

  await logAudit(req, session, {
    action: "CREATE",
    module: "CONTESTS",
    entityId: contest.id,
    entityLabel: contest.name,
    description:
      `Creó el concurso "${contest.name}" (${data.startDate} a ${data.endDate}) ` +
      `con ${data.items.length} ítem(s) que suman ${totalPercent}% de las propinas`,
    after: {
      name: contest.name,
      startDate: contest.startDate,
      endDate: contest.endDate,
      payoutMode: contest.payoutMode,
      items: data.items.map((i) => ({ name: i.name, percent: i.percent, goal: i.goalValue })),
    },
  });

  return NextResponse.json({ contest }, { status: 201 });
}
