import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permission-keys";
import { sessionCan } from "@/lib/get-permissions";
import { affectedDatesForHoliday, recalculateSpecialForDates } from "@/lib/special-days";
import { isValidCalendarDate } from "@/lib/holidays";

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    year: z.number().int().min(2000).max(2100).nullable().default(null),
  })
  .refine((v) => isValidCalendarDate(v.month, v.day, v.year), {
    message: "La fecha no es válida",
    path: ["day"],
  });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.HOLIDAYS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;
  const { id } = await params;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, month, day, year } = parsed.data;

  const existing = await prisma.holiday.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "Festivo no encontrado" }, { status: 404 });
  }

  // Colisión con OTRO festivo de la misma fecha.
  const collision = await prisma.holiday.findFirst({
    where: { tenantId, year, month, day, NOT: { id } },
    select: { id: true },
  });
  if (collision) {
    return NextResponse.json(
      { error: "Ya existe un festivo registrado para esa fecha" },
      { status: 409 }
    );
  }

  await prisma.holiday.update({
    where: { id },
    data: { name, month, day, year },
  });

  // Recalcular tanto las fechas viejas (que pueden dejar de ser especiales) como
  // las nuevas (que pasan a serlo).
  const oldDates = await affectedDatesForHoliday(tenantId, existing);
  const newDates = await affectedDatesForHoliday(tenantId, { year, month, day });
  const recalculated = await recalculateSpecialForDates(tenantId, [...oldDates, ...newDates]);

  await logAudit(req, session, {
    action: "UPDATE",
    module: "HOLIDAYS",
    entityId: id,
    entityLabel: name,
    description: `Editó el festivo "${name}". ${recalculated} turno(s) recalculado(s).`,
    before: { name: existing.name, month: existing.month, day: existing.day, year: existing.year },
    after: { name, month, day, year },
  });

  return NextResponse.json({ success: true, recalculated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.HOLIDAYS_DELETE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;
  const { id } = await params;

  const existing = await prisma.holiday.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "Festivo no encontrado" }, { status: 404 });
  }

  // Capturar fechas afectadas ANTES de borrar, para recalcular después.
  const dates = await affectedDatesForHoliday(tenantId, existing);

  await prisma.holiday.delete({ where: { id } });

  // Tras eliminar, los turnos de esas fechas dejan de ser especiales (salvo que
  // sigan siendo domingo o festivo nacional). recalculateSpecialForDates lo
  // resuelve porque recomputa isSpecialDayForTenant de cero.
  const recalculated = await recalculateSpecialForDates(tenantId, dates);

  await logAudit(req, session, {
    action: "DELETE",
    module: "HOLIDAYS",
    entityId: id,
    entityLabel: existing.name,
    description: `Eliminó el festivo "${existing.name}". ${recalculated} turno(s) recalculado(s).`,
    before: { name: existing.name, month: existing.month, day: existing.day, year: existing.year },
  });

  return NextResponse.json({ success: true, recalculated });
}
