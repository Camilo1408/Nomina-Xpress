import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recalculateTipForDate } from "@/lib/recalculate-tips";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

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
  if (!session || !(await sessionCan(session, PERMISSIONS.EMPLOYEES_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Activar/desactivar empleados requiere el permiso específico
  if (parsed.data.active !== undefined && !(await sessionCan(session, PERMISSIONS.EMPLOYEES_DEACTIVATE))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Snapshot previo para auditoría
  const before = await prisma.employee.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });

  const employee = await prisma.employee.updateMany({
    where: { id, tenantId: session.user.tenantId },
    data: parsed.data,
  });

  if (employee.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cambio de estado activo/inactivo se audita como acción específica
  const isToggle =
    parsed.data.active !== undefined && parsed.data.active !== before?.active;
  await logAudit(req, session, {
    action: isToggle ? (parsed.data.active ? "ACTIVATE" : "DEACTIVATE") : "UPDATE",
    module: "EMPLOYEES",
    entityId: id,
    entityLabel: before?.name ?? null,
    description: isToggle
      ? `${parsed.data.active ? "Activó" : "Desactivó"} al empleado "${before?.name ?? id}"`
      : `Editó al empleado "${before?.name ?? id}"`,
    before: before ?? undefined,
    after: { ...before, ...parsed.data },
  });

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
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.EMPLOYEES_DELETE))) {
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

  await logAudit(req, session, {
    action: "DELETE",
    module: "EMPLOYEES",
    entityId: id,
    entityLabel: employee.name,
    description: `Eliminó al empleado "${employee.name}" y todos sus registros relacionados`,
    before: employee,
  });

  return NextResponse.json({ success: true });
}
