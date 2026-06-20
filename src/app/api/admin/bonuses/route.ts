import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { bonusInputSchema } from "@/lib/bonus-validation";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

// GET — lista de bonos del tenant (con asignaciones).
export async function GET() {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.BONUSES_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bonuses = await prisma.bonus.findMany({
    where: { tenantId: session.user.tenantId },
    include: {
      assignments: {
        include: { employee: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(bonuses);
}

// POST — crear bono.
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.BONUSES_CREATE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = bonusInputSchema.safeParse(body);
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

  // Las asignaciones solo se materializan cuando son necesarias:
  //  - SPECIFIC: define membresía
  //  - PER_EMPLOYEE: define montos individuales
  const needsAssignments =
    data.assignmentType === "SPECIFIC" || data.valueType === "PER_EMPLOYEE";

  const bonus = await prisma.bonus.create({
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
    module: "BONUSES",
    entityId: bonus.id,
    entityLabel: bonus.name,
    description: `Creó el bono "${bonus.name}" (${bonus.assignmentType}, ${bonus.frequency})`,
    after: { name: bonus.name, amount: bonus.amount, valueType: bonus.valueType, assignmentType: bonus.assignmentType, frequency: bonus.frequency },
  });

  return NextResponse.json(bonus, { status: 201 });
}
