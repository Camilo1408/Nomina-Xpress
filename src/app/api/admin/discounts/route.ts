import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { discountInputSchema } from "@/lib/discount-validation";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

// GET — lista de descuentos del tenant (con asignaciones).
export async function GET() {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.DISCOUNTS_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const discounts = await prisma.discount.findMany({
    where: { tenantId: session.user.tenantId },
    include: {
      assignments: {
        include: { employee: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(discounts);
}

// POST — crear descuento.
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.DISCOUNTS_CREATE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = discountInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const tenantId = session.user.tenantId;

  // Validar que los empleados de las asignaciones pertenezcan al tenant
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

  const discount = await prisma.discount.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description ?? null,
      valueType: data.valueType,
      amount: data.valueType === "STANDARD" ? (data.amount ?? 0) : 0,
      assignmentType: data.assignmentType,
      frequency: data.frequency,
      monthlyMode: data.frequency === "MONTHLY" ? data.monthlyMode ?? null : null,
      active: data.active ?? true,
      createdById: session.user.id,
      ...(needsAssignments && empIds.length > 0
        ? {
            assignments: {
              create: data.assignments.map((a) => ({
                tenantId,
                employeeId: a.employeeId,
                amount: data.valueType === "PER_EMPLOYEE" ? a.amount ?? null : null,
              })),
            },
          }
        : {}),
    },
    include: { assignments: true },
  });

  await logAudit(req, session, {
    action: "CREATE",
    module: "DISCOUNTS",
    entityId: discount.id,
    entityLabel: discount.name,
    description: `Creó el descuento "${discount.name}" (${discount.assignmentType}, ${discount.frequency})`,
    after: { name: discount.name, amount: discount.amount, valueType: discount.valueType, assignmentType: discount.assignmentType, frequency: discount.frequency },
  });

  return NextResponse.json(discount, { status: 201 });
}
