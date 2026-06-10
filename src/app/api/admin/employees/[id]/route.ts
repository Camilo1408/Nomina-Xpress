import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recalculateTipForDate } from "@/lib/recalculate-tips";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  documentId: z.string().optional(),
  phone: z.string().optional(),
  hourlyRateNormal: z.number().positive().optional(),
  hourlyRateSpecial: z.number().positive().optional(),
  tipPercent: z.number().min(0).max(100).optional(),
  payType: z.enum(["PAYROLL", "SHIFT"]).optional(),
  active: z.boolean().optional(),
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

  // Solo PROPRIETARY puede activar/desactivar empleados
  if (parsed.data.active !== undefined && session.user.role !== "PROPRIETARY") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employee = await prisma.employee.updateMany({
    where: { id, tenantId: session.user.tenantId },
    data: parsed.data,
  });

  if (employee.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Si cambió tipPercent, recalcular todas las distribuciones existentes del empleado
  if (parsed.data.tipPercent !== undefined) {
    const affectedDists = await prisma.tipDistribution.findMany({
      where: { employeeId: id, tenantId: session.user.tenantId },
      include: { tipEntry: { select: { date: true } } },
    });
    const dates = [...new Set(affectedDists.map((d) => d.tipEntry.date))];
    await Promise.all(dates.map((date) => recalculateTipForDate(session.user.tenantId, date)));
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  // Solo PROPRIETARY puede eliminar empleados
  if (!session || session.user.role !== "PROPRIETARY") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const employee = await prisma.employee.findFirst({ where: { id, tenantId } });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Cascade manual: eliminar registros relacionados antes del empleado.
    // Orden importa por las foreign keys que no tienen onDelete: Cascade en el schema.
    await prisma.tipDistribution.deleteMany({ where: { employeeId: id, tenantId } });
    await prisma.payAdjustment.deleteMany({ where: { employeeId: id, tenantId } });
    await prisma.scheduleShift.deleteMany({ where: { employeeId: id } });
    await prisma.timeEntry.deleteMany({ where: { employeeId: id, tenantId } });
    await prisma.user.deleteMany({ where: { employeeId: id, tenantId } });
    await prisma.employee.delete({ where: { id } });
  } catch (err) {
    console.error("[admin/employees DELETE] cascade error:", err);
    return NextResponse.json(
      { error: { message: "No se pudo eliminar el empleado. Revisa registros relacionados." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
