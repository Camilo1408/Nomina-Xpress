import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { computeTipsForDate, persistTipCalculation } from "@/lib/recalculate-tips";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

const updateSchema = z.object({
  totalAmount: z.number().positive(),
  notes: z.string().optional().nullable(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIPS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await prisma.tipEntry.findFirst({ where: { id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Datos inválidos" } }, { status: 400 });
  }

  const { totalAmount, notes } = parsed.data;

  // Recalcula con el nuevo total, respetando las reservas de concurso del día.
  // Si el total nuevo no alcanza para cubrir el menaje más lo ya congelado por un
  // concurso finalizado, computeTipsForDate lanza y la edición se rechaza en vez
  // de dejar un neto negativo.
  let calc;
  try {
    ({ calc } = await computeTipsForDate(tenantId, existing.date, totalAmount));
  } catch (err) {
    return NextResponse.json({ error: { message: (err as Error).message } }, { status: 400 });
  }

  const fresh = await prisma.$transaction(async (tx) => {
    await tx.tipEntry.update({
      where: { id },
      data: { totalAmount, notes: notes ?? null },
    });

    await persistTipCalculation(tx, {
      tenantId,
      tipEntryId: id,
      date: existing.date,
      calc,
      reason: `Edición de las propinas del ${existing.date}`,
    });

    return tx.tipEntry.findUniqueOrThrow({
      where: { id },
      include: {
        distributions: {
          include: { employee: { select: { id: true, name: true } } },
          orderBy: { amount: "desc" },
        },
      },
    });
  });

  await logAudit(req, session, {
    action: "UPDATE",
    module: "TIPS",
    entityId: id,
    entityLabel: `Propinas ${existing.date}`,
    description: `Editó las propinas del ${existing.date}: total ${existing.totalAmount} → ${totalAmount}`,
    before: {
      totalAmount: existing.totalAmount,
      menaje: existing.menaje,
      contestReserved: existing.contestReserved,
      netAmount: existing.netAmount,
      notes: existing.notes,
    },
    after: {
      totalAmount,
      menaje: calc.menaje,
      contestReserved: calc.contestReserved,
      netAmount: calc.netAmount,
      notes,
    },
  });

  return NextResponse.json({ entry: fresh });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIPS_DELETE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await prisma.tipEntry.findFirst({ where: { id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.tipEntry.delete({ where: { id } });

  await logAudit(req, session, {
    action: "DELETE",
    module: "TIPS",
    entityId: id,
    entityLabel: `Propinas ${existing.date}`,
    description: `Eliminó las propinas del ${existing.date} (total ${existing.totalAmount})`,
    before: existing,
  });

  return NextResponse.json({ ok: true });
}
