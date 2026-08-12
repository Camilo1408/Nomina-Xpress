import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { contestResultsSchema } from "@/lib/contest-validation";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

/**
 * Registra o actualiza los resultados de los participantes de un ítem.
 *
 * El sistema no conoce las ventas: viven en el módulo de inventario, en otra base
 * de datos. La captura es manual y queda auditada. `achievedAt` solo importa para
 * el criterio PRIMERO_EN_ALCANZAR.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_AWARD))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, itemId } = await params;
  const tenantId = session.user.tenantId;

  const item = await prisma.contestItem.findFirst({
    where: { id: itemId, contestId: id, tenantId },
    include: { contest: { select: { name: true, status: true } } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (item.outcome !== "PENDIENTE") {
    return NextResponse.json(
      {
        error: {
          message: `El ítem ya fue resuelto (${item.outcome}); sus resultados no se pueden cambiar`,
        },
      },
      { status: 409 }
    );
  }
  if (item.contest.status === "CANCELADO") {
    return NextResponse.json(
      { error: { message: "El concurso está cancelado" } },
      { status: 409 }
    );
  }

  const body = await req.json();
  const parsed = contestResultsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Datos inválidos", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const empIds = [...new Set(parsed.data.results.map((r) => r.employeeId))];
  if (empIds.length !== parsed.data.results.length) {
    return NextResponse.json(
      { error: { message: "Hay un empleado repetido en la lista de resultados" } },
      { status: 400 }
    );
  }

  const validos = await prisma.employee.count({ where: { id: { in: empIds }, tenantId } });
  if (validos !== empIds.length) {
    return NextResponse.json(
      { error: { message: "Uno o más empleados no pertenecen a este restaurante" } },
      { status: 400 }
    );
  }

  const before = await prisma.contestItemResult.findMany({
    where: { tenantId, contestItemId: itemId },
    select: { employeeId: true, value: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const r of parsed.data.results) {
      await tx.contestItemResult.upsert({
        where: { contestItemId_employeeId: { contestItemId: itemId, employeeId: r.employeeId } },
        create: {
          tenantId,
          contestItemId: itemId,
          employeeId: r.employeeId,
          value: r.value,
          achievedAt: r.achievedAt ? new Date(r.achievedAt) : null,
          notes: r.notes ?? null,
          recordedById: session.user.id,
        },
        update: {
          value: r.value,
          achievedAt: r.achievedAt ? new Date(r.achievedAt) : null,
          notes: r.notes ?? null,
          recordedById: session.user.id,
        },
      });
    }
    // Los que dejan de figurar en la lista se retiran del ítem.
    await tx.contestItemResult.deleteMany({
      where: { tenantId, contestItemId: itemId, employeeId: { notIn: empIds } },
    });
  });

  const results = await prisma.contestItemResult.findMany({
    where: { tenantId, contestItemId: itemId },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: { value: "desc" },
  });

  const cumplen = results.filter((r) =>
    item.criteria === "MENOR_VALOR" ? r.value <= item.goalValue : r.value >= item.goalValue
  ).length;

  await logAudit(req, session, {
    action: "UPDATE",
    module: "CONTESTS",
    entityId: itemId,
    entityLabel: `${item.contest.name} · ${item.name}`,
    description:
      `Registró ${results.length} resultado(s) en el ítem "${item.name}" ` +
      `(${cumplen} alcanzan la meta de ${item.goalValue} ${item.goalUnit})`,
    before: { results: before },
    after: { results: parsed.data.results },
  });

  return NextResponse.json({ results, qualifiedCount: cumplen });
}
