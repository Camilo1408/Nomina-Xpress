import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { discountInputSchema } from "@/lib/discount-validation";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

const patchSchema = z.object({ active: z.boolean() });

// PUT — editar descuento completo.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.DISCOUNTS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await prisma.discount.findFirst({ where: { id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = discountInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const empIds = [...new Set(data.assignments.map((a) => a.employeeId))];
  if (empIds.length > 0) {
    const valid = await prisma.employee.count({
      where: { id: { in: empIds }, tenantId },
    });
    if (valid !== empIds.length) {
      return NextResponse.json(
        { error: { message: "Uno o más empleados no pertenecen a este restaurante" } },
        { status: 400 }
      );
    }
  }

  const needsAssignments =
    data.assignmentType === "SPECIFIC" || data.valueType === "PER_EMPLOYEE";

  await prisma.$transaction([
    prisma.discount.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description ?? null,
        valueType: data.valueType,
        amount: data.valueType === "STANDARD" ? (data.amount ?? 0) : 0,
        assignmentType: data.assignmentType,
        frequency: data.frequency,
        monthlyMode: data.frequency === "MONTHLY" ? data.monthlyMode ?? null : null,
        active: data.active ?? existing.active,
      },
    }),
    prisma.discountAssignment.deleteMany({ where: { discountId: id } }),
    ...(needsAssignments && empIds.length > 0
      ? [
          prisma.discountAssignment.createMany({
            data: data.assignments.map((a) => ({
              tenantId,
              discountId: id,
              employeeId: a.employeeId,
              amount: data.valueType === "PER_EMPLOYEE" ? a.amount ?? null : null,
            })),
          }),
        ]
      : []),
  ]);

  await logAudit(req, session, {
    action: "UPDATE",
    module: "DISCOUNTS",
    entityId: id,
    entityLabel: data.name,
    description: `Editó el descuento "${existing.name}"`,
    before: { name: existing.name, amount: existing.amount, valueType: existing.valueType, assignmentType: existing.assignmentType, frequency: existing.frequency, active: existing.active },
    after: { name: data.name, amount: data.amount, valueType: data.valueType, assignmentType: data.assignmentType, frequency: data.frequency },
  });

  return NextResponse.json({ success: true });
}

// PATCH — activar/desactivar descuento.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.DISCOUNTS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.discount.findFirst({ where: { id, tenantId } });
  const updated = await prisma.discount.updateMany({
    where: { id, tenantId },
    data: { active: parsed.data.active },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await logAudit(req, session, {
    action: parsed.data.active ? "ACTIVATE" : "DEACTIVATE",
    module: "DISCOUNTS",
    entityId: id,
    entityLabel: existing?.name ?? id,
    description: `${parsed.data.active ? "Activó" : "Desactivó"} el descuento "${existing?.name ?? id}"`,
    before: { active: existing?.active },
    after: { active: parsed.data.active },
  });

  return NextResponse.json({ success: true });
}

// DELETE — eliminar descuento. Solo full admin.
// Seguro: cálculo stateless, sin filas históricas que lo referencien.
// Asignaciones se borran en cascada.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.DISCOUNTS_DELETE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await prisma.discount.findFirst({ where: { id, tenantId } });
  const deleted = await prisma.discount.deleteMany({ where: { id, tenantId } });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await logAudit(req, session, {
    action: "DELETE",
    module: "DISCOUNTS",
    entityId: id,
    entityLabel: existing?.name ?? id,
    description: `Eliminó el descuento "${existing?.name ?? id}"`,
    before: existing ?? undefined,
  });

  return NextResponse.json({ success: true });
}
