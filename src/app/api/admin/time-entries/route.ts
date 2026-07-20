import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSpecialDayForTenant } from "@/lib/special-days";
import { recalculateTipForDate } from "@/lib/recalculate-tips";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { validateShiftWindow, sumDailyHours, MAX_DAILY_HOURS } from "@/lib/shift-times";

const createSchema = z.object({
  employeeId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkIn: z.string(),
  checkOut: z.string().nullable().optional(),
  checkIn2: z.string().nullable().optional(),
  checkOut2: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

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

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIME_ENTRIES_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const employeeId = url.searchParams.get("employeeId");

  const entries = await prisma.timeEntry.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(from && to ? { date: { gte: from, lte: to } } : {}),
      ...(employeeId ? { employeeId } : {}),
    },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: [{ date: "desc" }, { checkIn: "desc" }],
  });
  return NextResponse.json(entries);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIME_ENTRIES_CREATE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, checkIn, checkOut, checkIn2, checkOut2, employeeId, notes } = parsed.data;

  // Validar que el empleado pertenezca al tenant antes de escribir
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: session.user.tenantId },
    select: { id: true, name: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const existingEntries = await prisma.timeEntry.findMany({
    where: { tenantId: session.user.tenantId, employeeId, date },
  });

  if (existingEntries.length >= 2) {
    return NextResponse.json(
      { error: "El empleado ya tiene 2 registros para este día. El máximo permitido son 2 turnos diarios." },
      { status: 409 }
    );
  }

  // Validar la ventana de la salida: posterior a la entrada, con cruce de
  // medianoche permitido hasta las 2:00 AM del día siguiente.
  const win1 = validateShiftWindow(date, new Date(checkIn), checkOut ? new Date(checkOut) : null);
  if (!win1.ok) {
    return NextResponse.json({ error: win1.error }, { status: 400 });
  }
  if (checkIn2) {
    const win2 = validateShiftWindow(date, new Date(checkIn2), checkOut2 ? new Date(checkOut2) : null);
    if (!win2.ok) {
      return NextResponse.json({ error: win2.error }, { status: 400 });
    }
  }

  const newStart = new Date(checkIn);
  const newEnd = checkOut ? new Date(checkOut) : null;

  for (const existing of existingEntries) {
    if (rangesOverlap(newStart, newEnd, existing.checkIn, existing.checkOut, date)) {
      return NextResponse.json(
        { error: "El horario ingresado se superpone con un turno ya registrado para este empleado en esta fecha." },
        { status: 409 }
      );
    }
  }

  // Tope de horas diarias por empleado: suma de todos los turnos del día.
  const dailyTotal = sumDailyHours([
    ...existingEntries,
    {
      checkIn: newStart,
      checkOut: newEnd,
      checkIn2: checkIn2 ? new Date(checkIn2) : null,
      checkOut2: checkOut2 ? new Date(checkOut2) : null,
    },
  ]);
  if (dailyTotal > MAX_DAILY_HOURS) {
    return NextResponse.json(
      {
        error: `El total de horas del día para este empleado superaría el máximo de ${MAX_DAILY_HOURS} h (quedaría en ${dailyTotal.toFixed(1)} h).`,
      },
      { status: 409 }
    );
  }

  const special = await isSpecialDayForTenant(session.user.tenantId, date);

  const entry = await prisma.timeEntry.create({
    data: {
      tenantId: session.user.tenantId,
      employeeId,
      date,
      checkIn: new Date(checkIn),
      checkOut: checkOut ? new Date(checkOut) : null,
      checkIn2: checkIn2 ? new Date(checkIn2) : null,
      checkOut2: checkOut2 ? new Date(checkOut2) : null,
      isSpecial: special,
      notes: notes ?? null,
    },
  });

  // Si hay propinas registradas para este día, recalcular distribuciones
  await recalculateTipForDate(session.user.tenantId, date);

  await logAudit(req, session, {
    action: "CREATE",
    module: "TIME_ENTRIES",
    entityId: entry.id,
    entityLabel: `${employee.name} — ${date}`,
    description: `Registró horas de "${employee.name}" el ${date}`,
    after: { date, checkIn, checkOut, checkIn2, checkOut2, isSpecial: special, notes },
  });

  return NextResponse.json(entry, { status: 201 });
}
