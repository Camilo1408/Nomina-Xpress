import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSpecialDayForTenant } from "@/lib/special-days";
import { recalculateTipForDate } from "@/lib/recalculate-tips";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().nullable().optional(),
  checkIn2: z.string().nullable().optional(),
  checkOut2: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIME_ENTRIES_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, checkIn, checkOut, checkIn2, checkOut2, notes } = parsed.data;

  // Leer el registro actual (para recalcular propinas y validar horarios)
  const existing = await prisma.timeEntry.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: {
      date: true,
      checkIn: true,
      checkOut: true,
      checkIn2: true,
      checkOut2: true,
      notes: true,
      employee: { select: { name: true } },
    },
  });

  // Validar que salida > entrada fusionando valores actuales con los nuevos
  const effectiveCheckIn = checkIn ? new Date(checkIn) : existing?.checkIn;
  const effectiveCheckOut =
    checkOut !== undefined
      ? checkOut ? new Date(checkOut) : null
      : existing?.checkOut ?? null;
  const effectiveCheckIn2 =
    checkIn2 !== undefined
      ? checkIn2 ? new Date(checkIn2) : null
      : existing?.checkIn2 ?? null;
  const effectiveCheckOut2 =
    checkOut2 !== undefined
      ? checkOut2 ? new Date(checkOut2) : null
      : existing?.checkOut2 ?? null;

  if (effectiveCheckIn && effectiveCheckOut && effectiveCheckOut <= effectiveCheckIn) {
    return NextResponse.json(
      { error: "La hora de salida debe ser posterior a la hora de entrada." },
      { status: 400 }
    );
  }
  if (effectiveCheckIn2 && effectiveCheckOut2 && effectiveCheckOut2 <= effectiveCheckIn2) {
    return NextResponse.json(
      { error: "La hora de salida del segundo turno debe ser posterior a su hora de entrada." },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (date !== undefined) {
    updateData.date = date;
    updateData.isSpecial = await isSpecialDayForTenant(session.user.tenantId, date);
  }
  if (checkIn !== undefined) updateData.checkIn = new Date(checkIn);
  if (checkOut !== undefined) updateData.checkOut = checkOut ? new Date(checkOut) : null;
  if (checkIn2 !== undefined) updateData.checkIn2 = checkIn2 ? new Date(checkIn2) : null;
  if (checkOut2 !== undefined) updateData.checkOut2 = checkOut2 ? new Date(checkOut2) : null;
  if (notes !== undefined) updateData.notes = notes;

  await prisma.timeEntry.updateMany({
    where: { id, tenantId: session.user.tenantId },
    data: updateData,
  });

  // Recalcular propinas en la fecha nueva (y en la vieja si cambió)
  const newDate = (date ?? existing?.date)!;
  await recalculateTipForDate(session.user.tenantId, newDate);
  if (existing?.date && date && existing.date !== date) {
    await recalculateTipForDate(session.user.tenantId, existing.date);
  }

  await logAudit(req, session, {
    action: "UPDATE",
    module: "TIME_ENTRIES",
    entityId: id,
    entityLabel: existing?.employee?.name
      ? `${existing.employee.name} — ${newDate}`
      : newDate,
    description: `Editó el registro de horas de "${existing?.employee?.name ?? "empleado"}" del ${existing?.date ?? newDate}`,
    before: existing ?? undefined,
    after: updateData,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIME_ENTRIES_DELETE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // Leer la fecha antes de borrar para poder recalcular propinas
  const toDelete = await prisma.timeEntry.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: {
      date: true,
      checkIn: true,
      checkOut: true,
      checkIn2: true,
      checkOut2: true,
      employee: { select: { name: true } },
    },
  });

  await prisma.timeEntry.deleteMany({ where: { id, tenantId: session.user.tenantId } });

  if (toDelete?.date) {
    await recalculateTipForDate(session.user.tenantId, toDelete.date);
  }

  if (toDelete) {
    await logAudit(req, session, {
      action: "DELETE",
      module: "TIME_ENTRIES",
      entityId: id,
      entityLabel: toDelete.employee?.name
        ? `${toDelete.employee.name} — ${toDelete.date}`
        : toDelete.date,
      description: `Eliminó el registro de horas de "${toDelete.employee?.name ?? "empleado"}" del ${toDelete.date}`,
      before: toDelete,
    });
  }

  return NextResponse.json({ success: true });
}
