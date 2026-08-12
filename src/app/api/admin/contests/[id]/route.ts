import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { contestUpdateSchema } from "@/lib/contest-validation";
import {
  computeImpactPreview,
  recalculateTipsForRange,
  validateContestPercentages,
} from "@/lib/contest-service";
import { isContestConfigEditable, type ContestStatus } from "@/lib/contests";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

// GET — detalle completo: ítems, resultados, reservas y bonos.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const contest = await prisma.contest.findFirst({
    where: { id, tenantId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          results: {
            include: { employee: { select: { id: true, name: true, active: true } } },
            orderBy: { value: "desc" },
          },
          bonuses: {
            include: {
              employee: { select: { id: true, name: true } },
              payments: { orderBy: { installment: "asc" } },
            },
          },
        },
      },
    },
  });

  if (!contest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reserves = await prisma.contestTipReserve.findMany({
    where: { tenantId, contestId: id },
    orderBy: [{ date: "asc" }],
  });

  return NextResponse.json({ contest, reserves });
}

// PUT — editar la configuración. Prohibido en FINALIZADO, PAGADO y CANCELADO.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await prisma.contest.findFirst({
    where: { id, tenantId },
    include: { items: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isContestConfigEditable(existing.status as ContestStatus)) {
    return NextResponse.json(
      {
        error: {
          message: `No se puede editar la configuración de un concurso ${existing.status}. Sus reservas ya están congeladas.`,
        },
      },
      { status: 409 }
    );
  }

  const body = await req.json();
  const parsed = contestUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Datos inválidos", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const check = await validateContestPercentages({
    tenantId,
    startDate: data.startDate,
    endDate: data.endDate,
    percents: existing.items.map((i) => i.percent),
    excludeContestId: id,
  });
  if (!check.ok) {
    return NextResponse.json(
      { error: { message: check.error, conflicts: check.conflicts } },
      { status: 400 }
    );
  }

  const rangeChanged =
    data.startDate !== existing.startDate || data.endDate !== existing.endDate;

  // Cambiar el rango de un concurso ACTIVO mueve dinero: días que salen se
  // devuelven, días que entran se reservan. Exige confirmación informada.
  if (rangeChanged && existing.status === "ACTIVO") {
    const preview = await computeImpactPreview({
      tenantId,
      contestId: id,
      simulated: {
        status: "ACTIVO",
        startDate: data.startDate,
        endDate: data.endDate,
        items: existing.items.map((i) => ({ id: i.id, percent: i.percent })),
      },
    });
    if (preview.error) {
      return NextResponse.json({ error: { message: preview.error } }, { status: 400 });
    }
    if (preview.affectedDays > 0 && !data.confirmImpact) {
      return NextResponse.json(
        {
          error: {
            message: "Este cambio modifica propinas ya repartidas. Revisa el impacto y confirma.",
            requiresConfirmation: true,
            preview,
          },
        },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.contest.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description ?? null,
      startDate: data.startDate,
      endDate: data.endDate,
      payoutMode: data.payoutMode,
    },
    include: { items: true },
  });

  // El rango nuevo y el viejo, para recalcular tanto lo que entra como lo que sale.
  let changes: Awaited<ReturnType<typeof recalculateTipsForRange>> = [];
  if (rangeChanged && existing.status === "ACTIVO") {
    const from = existing.startDate < data.startDate ? existing.startDate : data.startDate;
    const to = existing.endDate > data.endDate ? existing.endDate : data.endDate;
    changes = await recalculateTipsForRange(
      tenantId,
      from,
      to,
      `Cambio de fechas del concurso "${updated.name}"`
    );
  }

  await logAudit(req, session, {
    action: "UPDATE",
    module: "CONTESTS",
    entityId: id,
    entityLabel: updated.name,
    description:
      `Editó el concurso "${updated.name}"` +
      (changes.length > 0 ? `; se recalcularon ${changes.length} día(s) de propinas` : ""),
    before: {
      name: existing.name,
      startDate: existing.startDate,
      endDate: existing.endDate,
      payoutMode: existing.payoutMode,
    },
    after: {
      name: updated.name,
      startDate: updated.startDate,
      endDate: updated.endDate,
      payoutMode: updated.payoutMode,
      recalculatedDays: changes,
    },
  });

  return NextResponse.json({ contest: updated, changes });
}

// DELETE — solo en BORRADOR. Después hay dinero de por medio y el historial no
// se borra: se cancela, que devuelve la reserva y deja rastro.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_DELETE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await prisma.contest.findFirst({ where: { id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.status !== "BORRADOR") {
    return NextResponse.json(
      {
        error: {
          message: `Solo se puede eliminar un concurso en BORRADOR (está en ${existing.status}). Usa "Cancelar" para devolver la reserva conservando el historial.`,
        },
      },
      { status: 409 }
    );
  }

  await prisma.contest.delete({ where: { id } });

  await logAudit(req, session, {
    action: "DELETE",
    module: "CONTESTS",
    entityId: id,
    entityLabel: existing.name,
    description: `Eliminó el concurso en borrador "${existing.name}"`,
    before: existing,
  });

  return NextResponse.json({ ok: true });
}
