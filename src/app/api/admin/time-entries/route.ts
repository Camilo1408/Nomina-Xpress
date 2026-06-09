import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSpecialDay } from "@/lib/holidays";
import { recalculateTipForDate } from "@/lib/recalculate-tips";

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
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
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
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, checkIn, checkOut, checkIn2, checkOut2, employeeId, notes } = parsed.data;

  const existingEntries = await prisma.timeEntry.findMany({
    where: { tenantId: session.user.tenantId, employeeId, date },
  });

  if (existingEntries.length >= 2) {
    return NextResponse.json(
      { error: "El empleado ya tiene 2 registros para este día. El máximo permitido son 2 turnos diarios." },
      { status: 409 }
    );
  }

  // Validar que la salida sea posterior a la entrada
  if (checkOut && new Date(checkOut) <= new Date(checkIn)) {
    return NextResponse.json(
      { error: "La hora de salida debe ser posterior a la hora de entrada." },
      { status: 400 }
    );
  }
  if (checkIn2 && checkOut2 && new Date(checkOut2) <= new Date(checkIn2)) {
    return NextResponse.json(
      { error: "La hora de salida del segundo turno debe ser posterior a su hora de entrada." },
      { status: 400 }
    );
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

  const special = isSpecialDay(date);

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

  return NextResponse.json(entry, { status: 201 });
}
