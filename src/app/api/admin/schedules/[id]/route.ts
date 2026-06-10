import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  shifts: z.array(z.object({
    employeeId: z.string(),
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    startTime2: z.string().nullable().optional(),
    endTime2: z.string().nullable().optional(),
  })).optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !["SUPERADMIN", "PROPRIETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.schedule.findFirst({ where: { id, tenantId: session.user.tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, shifts } = parsed.data;
  if (shifts) {
    await prisma.scheduleShift.deleteMany({ where: { scheduleId: id } });
    await prisma.scheduleShift.createMany({
      data: shifts.map((s) => ({
        scheduleId: id,
        employeeId: s.employeeId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        startTime2: s.startTime2 ?? null,
        endTime2: s.endTime2 ?? null,
      })),
    });
  }
  if (name) {
    await prisma.schedule.update({ where: { id }, data: { name } });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !["SUPERADMIN", "PROPRIETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.schedule.deleteMany({ where: { id, tenantId: session.user.tenantId } });
  return NextResponse.json({ success: true });
}
