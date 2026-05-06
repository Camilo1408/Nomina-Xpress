import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  documentId: z.string().optional(),
  phone: z.string().optional(),
  hourlyRateNormal: z.number().positive().optional(),
  hourlyRateSpecial: z.number().positive().optional(),
  active: z.boolean().optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const employee = await prisma.employee.updateMany({
    where: { id, tenantId: session.user.tenantId },
    data: parsed.data,
  });

  if (employee.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const employee = await prisma.employee.findFirst({ where: { id, tenantId } });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cascade manual: eliminar registros relacionados antes del empleado
  await prisma.payAdjustment.deleteMany({ where: { employeeId: id, tenantId } });
  await prisma.scheduleShift.deleteMany({ where: { employeeId: id } });
  await prisma.timeEntry.deleteMany({ where: { employeeId: id, tenantId } });
  await prisma.user.deleteMany({ where: { employeeId: id, tenantId } });
  await prisma.employee.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
