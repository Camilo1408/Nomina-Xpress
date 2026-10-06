import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPeriodForDate } from "@/lib/tips";
import { computeTipsForDate, persistTipCalculation } from "@/lib/recalculate-tips";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmount: z.number().positive(),
  notes: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIPS_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const tenantId = session.user.tenantId;

  const entries = await prisma.tipEntry.findMany({
    where: {
      tenantId,
      ...(from && to ? { date: { gte: from, lte: to } } : {}),
    },
    include: {
      distributions: {
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { amount: "desc" },
      },
      // Desglose de lo reservado por cada ítem de concurso ese día, para que en
      // la pantalla de propinas se vea de dónde sale cada peso descontado.
      contestReserves: {
        where: { status: "RESERVADA" },
        select: {
          id: true,
          contestItemId: true,
          percent: true,
          amount: true,
          contestItem: { select: { name: true, contest: { select: { name: true } } } },
        },
      },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIPS_CREATE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } }, { status: 400 });
  }

  const { date, totalAmount, notes } = parsed.data;
  const tenantId = session.user.tenantId;

  // Check duplicate
  const existing = await prisma.tipEntry.findUnique({ where: { tenantId_date: { tenantId, date } } });
  if (existing) {
    return NextResponse.json({ error: { message: `Ya existe un registro de propinas para ${date}` } }, { status: 409 });
  }

  // Horas del día por empleado + porcentajes de concursos activos que reservan
  // sobre este día. Un solo punto de entrada, compartido con el recálculo.
  let calc;
  try {
    ({ calc } = await computeTipsForDate(tenantId, date, totalAmount));
  } catch (err) {
    return NextResponse.json({ error: { message: (err as Error).message } }, { status: 400 });
  }

  const { periodStart, periodEnd } = getPeriodForDate(date);

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.tipEntry.create({
      data: {
        tenantId,
        date,
        totalAmount,
        menaje: calc.menaje,
        netAmount: calc.netAmount,
        contestReserved: calc.contestReserved,
        periodStart,
        periodEnd,
        notes: notes ?? null,
      },
    });

    await persistTipCalculation(tx, {
      tenantId,
      tipEntryId: created.id,
      date,
      calc,
      reason: `Registro de propinas del ${date}`,
    });

    return tx.tipEntry.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        distributions: {
          include: { employee: { select: { id: true, name: true } } },
          orderBy: { amount: "desc" },
        },
      },
    });
  });

  const reservaTexto =
    calc.contestReserved > 0
      ? `, reservando ${calc.contestReserved} para ${calc.contestReserves.length} ítem(s) de concurso`
      : "";

  await logAudit(req, session, {
    action: "CREATE",
    module: "TIPS",
    entityId: entry.id,
    entityLabel: `Propinas ${date}`,
    description: `Registró propinas del ${date} por un total de ${totalAmount}, distribuidas a ${entry.distributions.length} empleado(s)${reservaTexto}`,
    after: {
      date,
      totalAmount,
      menaje: calc.menaje,
      contestReserved: calc.contestReserved,
      netAmount: calc.netAmount,
      notes,
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}
