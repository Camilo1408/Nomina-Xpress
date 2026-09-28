import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const updateSchema = z.object({
  type: z.enum(["DISCOUNT", "BONUS"]),
  amount: z.number().positive(),
  description: z.string().min(1),
  // El período es opcional: solo viaja cuando quien edita puede corregirlo.
  periodStart: z.string().regex(ISO_DATE).optional(),
  periodEnd: z.string().regex(ISO_DATE).optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.PAY_ADJUSTMENTS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const before = await prisma.payAdjustment.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { periodStart, periodEnd, ...base } = parsed.data;
  const nextStart = periodStart ?? before.periodStart;
  const nextEnd = periodEnd ?? before.periodEnd;
  const periodChanged = nextStart !== before.periodStart || nextEnd !== before.periodEnd;

  // Mover un ajuste de período mueve dinero de una quincena a otra: exige un
  // permiso aparte (PROPRIETARY y SUPERADMIN por defecto).
  if (periodChanged && !(await sessionCan(session, PERMISSIONS.PAY_ADJUSTMENTS_EDIT_PERIOD))) {
    return NextResponse.json(
      { error: "No tiene permiso para corregir el período del ajuste" },
      { status: 403 }
    );
  }
  if (nextStart > nextEnd) {
    return NextResponse.json(
      { error: "La fecha de inicio no puede ser posterior a la fecha final" },
      { status: 400 }
    );
  }

  const data = periodChanged
    ? { ...base, periodStart: nextStart, periodEnd: nextEnd }
    : base;

  await prisma.payAdjustment.updateMany({
    where: { id, tenantId: session.user.tenantId },
    data,
  });

  const periodNote = periodChanged
    ? ` y movió su período de ${before.periodStart}–${before.periodEnd} a ${nextStart}–${nextEnd}`
    : "";

  await logAudit(req, session, {
    action: "UPDATE",
    module: "PAY_ADJUSTMENTS",
    entityId: id,
    entityLabel: before.description,
    description: `Editó un ${
      base.type === "BONUS" ? "bono" : "descuento"
    } por ${base.amount} (${base.description})${periodNote}`,
    before,
    after: { ...before, ...data },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.PAY_ADJUSTMENTS_DELETE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const before = await prisma.payAdjustment.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  await prisma.payAdjustment.deleteMany({ where: { id, tenantId: session.user.tenantId } });

  if (before) {
    await logAudit(req, session, {
      action: "DELETE",
      module: "PAY_ADJUSTMENTS",
      entityId: id,
      entityLabel: before.description,
      description: `Eliminó un ${
        before.type === "BONUS" ? "bono" : "descuento"
      } de ${before.amount} (${before.description})`,
      before,
    });
  }

  return NextResponse.json({ success: true });
}
