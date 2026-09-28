import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { buildRestDayShift, buildWorkShift } from "@/lib/schedule-shifts";

const shiftSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  startTime2: z.string().nullable().optional(),
  endTime2: z.string().nullable().optional(),
  restDay: z.boolean().optional().default(false),
});

/**
 * Normaliza una fila del payload antes de persistirla.
 *
 * Un día de descanso se construye siempre desde cero: el servidor no confía en
 * que el cliente respete el centinela de horas ni deje vacío el segundo turno.
 */
function toShiftRow(s: z.infer<typeof shiftSchema>) {
  return s.restDay
    ? buildRestDayShift(s.employeeId, s.date)
    : buildWorkShift(s);
}

const createSchema = z.object({
  name: z.string().min(1),
  weekStart: z.string(),
  shifts: z.array(shiftSchema),
});

export async function GET() {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.SCHEDULES_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const schedules = await prisma.schedule.findMany({
    where: { tenantId: session.user.tenantId },
    include: { shifts: { include: { employee: { select: { id: true, name: true } } } } },
    orderBy: { weekStart: "desc" },
  });
  return NextResponse.json(schedules);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.SCHEDULES_CREATE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, weekStart, shifts } = parsed.data;

  // Validar que todos los empleados referenciados pertenezcan al tenant
  const shiftEmployeeIds = [...new Set(shifts.map((s) => s.employeeId))];
  if (shiftEmployeeIds.length > 0) {
    const validCount = await prisma.employee.count({
      where: { id: { in: shiftEmployeeIds }, tenantId: session.user.tenantId },
    });
    if (validCount !== shiftEmployeeIds.length) {
      return NextResponse.json(
        { error: "Uno o más empleados no pertenecen a este restaurante" },
        { status: 400 }
      );
    }
  }

  const schedule = await prisma.schedule.create({
    data: {
      tenantId: session.user.tenantId,
      name,
      weekStart,
      shifts: {
        create: shifts.map(toShiftRow),
      },
    },
    include: { shifts: true },
  });

  await logAudit(req, session, {
    action: "CREATE",
    module: "SCHEDULES",
    entityId: schedule.id,
    entityLabel: schedule.name,
    description: `Creó el horario "${schedule.name}" (semana ${weekStart}) con ${schedule.shifts.length} turno(s)`,
    after: { name, weekStart, shiftsCount: schedule.shifts.length },
  });

  return NextResponse.json(schedule, { status: 201 });
}
