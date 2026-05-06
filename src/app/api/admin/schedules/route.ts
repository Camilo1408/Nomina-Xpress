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
  if (!session || session.user.role !== "ADMIN") {
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
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, weekStart, shifts } = parsed.data;
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
