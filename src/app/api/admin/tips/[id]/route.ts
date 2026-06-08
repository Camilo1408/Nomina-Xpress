import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateTips } from "@/lib/tips";
import { calculateHours } from "@/lib/payroll";

const updateSchema = z.object({
  totalAmount: z.number().positive(),
  notes: z.string().optional().nullable(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await prisma.tipEntry.findFirst({ where: { id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Datos inválidos" } }, { status: 400 });
  }

  const { totalAmount, notes } = parsed.data;

  // Recalculate distribution with new amount
  const timeEntries = await prisma.timeEntry.findMany({
    where: { tenantId, date: existing.date },
    include: { employee: { select: { id: true, name: true, tipPercent: true, active: true } } },
  });

  const hoursMap = new Map<string, { employee: { id: string; name: string; tipPercent: number }; hours: number }>();
  for (const te of timeEntries) {
    if (!te.employee.active) continue;
    const prev = hoursMap.get(te.employeeId) ?? { employee: te.employee, hours: 0 };
    let h = 0;
    if (te.checkOut) h += calculateHours(te.checkIn, te.checkOut);
    if (te.checkIn2 && te.checkOut2) h += calculateHours(te.checkIn2, te.checkOut2);
    hoursMap.set(te.employeeId, { employee: te.employee, hours: prev.hours + h });
  }

  const employeeInputs = Array.from(hoursMap.values()).map((v) => ({
    id: v.employee.id,
    name: v.employee.name,
    hoursWorked: Math.round(v.hours * 100) / 100,
    tipPercent: Number(v.employee.tipPercent),
  }));

  const calc = calculateTips(totalAmount, employeeInputs);

  // Update entry and rebuild distributions
  const [updated] = await prisma.$transaction([
    prisma.tipEntry.update({
      where: { id },
      data: {
        totalAmount,
        menaje: calc.menaje,
        netAmount: calc.netAmount,
        notes: notes ?? null,
      },
      include: {
        distributions: {
          include: { employee: { select: { id: true, name: true } } },
          orderBy: { amount: "desc" },
        },
      },
    }),
    prisma.tipDistribution.deleteMany({ where: { tipEntryId: id } }),
  ]);

  // Re-create distributions
  await prisma.tipDistribution.createMany({
    data: calc.distributions.map((d) => ({
      tenantId,
      tipEntryId: id,
      employeeId: d.employeeId,
      hoursWorked: d.hoursWorked,
      tipPercent: d.tipPercent,
      effectiveHours: d.effectiveHours,
      amount: d.amount,
    })),
  });

  const fresh = await prisma.tipEntry.findUnique({
    where: { id },
    include: {
      distributions: {
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { amount: "desc" },
      },
    },
  });

  return NextResponse.json({ entry: fresh ?? updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existing = await prisma.tipEntry.findFirst({ where: { id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.tipEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
