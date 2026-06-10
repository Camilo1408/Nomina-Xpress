import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const shiftSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  startTime2: z.string().nullable().optional(),
  endTime2: z.string().nullable().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  weekStart: z.string(),
  shifts: z.array(shiftSchema),
});

export async function GET() {
  const session = await auth();
  if (!session || !["SUPERADMIN", "PROPRIETARY"].includes(session.user.role)) {
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
  if (!session || !["SUPERADMIN", "PROPRIETARY"].includes(session.user.role)) {
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
        create: shifts.map((s) => ({
          employeeId: s.employeeId,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          startTime2: s.startTime2 ?? null,
          endTime2: s.endTime2 ?? null,
        })),
      },
    },
    include: { shifts: true },
  });
  return NextResponse.json(schedule, { status: 201 });
}
