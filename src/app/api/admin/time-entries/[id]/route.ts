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
  employeeId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().nullable().optional(),
  checkIn2: z.string().nullable().optional(),
  checkOut2: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Igual que en el POST: dos turnos del mismo día no pueden solaparse.
function rangesOverlap(
  aStart: Date,
  aEnd: Date | null,
  bStart: Date,
  bEnd: Date | null,
  date: string
): boolean {
  const dayEnd = new Date(date + "T23:59:59");
  const effAEnd = aEnd ?? dayEnd;
  const effBEnd = bEnd ?? dayEnd;
  return aStart < effBEnd && bStart < effAEnd;
}

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

  const { employeeId, date, checkIn, checkOut, checkIn2, checkOut2, notes } = parsed.data;

  // Leer el registro actual (para recalcular propinas y validar horarios)
  const existing = await prisma.timeEntry.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: {
      employeeId: true,
      date: true,
      checkIn: true,
      checkOut: true,
      checkIn2: true,
      checkOut2: true,
      notes: true,
      employee: { select: { name: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }

  // Si se reasigna el empleado, validar que pertenezca al tenant (no permitir
  // asignaciones inválidas / de otro cliente).
  let targetEmployeeName = existing.employee?.name ?? "empleado";
  if (employeeId !== undefined && employeeId !== existing.employeeId) {
    const target = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId: session.user.tenantId },
      select: { id: true, name: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
    }
    targetEmployeeName = target.name;
  }

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

  // Si el registro se mueve a otro empleado o a otra fecha, revalidar contra el
  // destino: mismas reglas que al crear (máx. 2 turnos/día y sin solapamiento).
  const effectiveEmployeeId = employeeId ?? existing.employeeId;
  const effectiveDate = date ?? existing.date;
  const isMoving =
    effectiveEmployeeId !== existing.employeeId || effectiveDate !== existing.date;

  if (isMoving && effectiveCheckIn) {
    const siblings = await prisma.timeEntry.findMany({
      where: {
        tenantId: session.user.tenantId,
        employeeId: effectiveEmployeeId,
        date: effectiveDate,
        id: { not: id },
      },
      select: { checkIn: true, checkOut: true },
    });

    if (siblings.length >= 2) {
      return NextResponse.json(
        { error: "El empleado ya tiene 2 registros para este día. El máximo permitido son 2 turnos diarios." },
        { status: 409 }
      );
    }

    for (const sib of siblings) {
      if (rangesOverlap(effectiveCheckIn, effectiveCheckOut, sib.checkIn, sib.checkOut, effectiveDate)) {
        return NextResponse.json(
          { error: "El horario ingresado se superpone con un turno ya registrado para este empleado en esta fecha." },
          { status: 409 }
        );
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (employeeId !== undefined) updateData.employeeId = employeeId;
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
    entityLabel: `${targetEmployeeName} — ${newDate}`,
    description: `Editó el registro de horas de "${existing.employee?.name ?? "empleado"}" del ${existing.date}`,
    before: existing,
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
