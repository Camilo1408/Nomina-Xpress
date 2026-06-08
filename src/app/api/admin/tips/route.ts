import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateTips, getPeriodForDate } from "@/lib/tips";
import { calculateHours } from "@/lib/payroll";

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmount: z.number().positive(),
  notes: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const tenantId = session.user.tenantId;

  const entries = await prisma.tipEntry.findMany({
    where: {
      tenantId,
      ...(from && to ? { date: { gte: from, lte: to } } : {}),
    },
    include: {
      distributions: {
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { amount: "desc" },
      },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } }, { status: 400 });
  }

  const { date, totalAmount, notes } = parsed.data;
  const tenantId = session.user.tenantId;

  // Check duplicate
  const existing = await prisma.tipEntry.findUnique({ where: { tenantId_date: { tenantId, date } } });
  if (existing) {
    return NextResponse.json({ error: { message: `Ya existe un registro de propinas para ${date}` } }, { status: 409 });
  }

  // Get time entries for the day to calculate hours per employee
  const timeEntries = await prisma.timeEntry.findMany({
    where: { tenantId, date },
    include: { employee: { select: { id: true, name: true, tipPercent: true, active: true } } },
  });

  // Aggregate hours per employee
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
  const { periodStart, periodEnd } = getPeriodForDate(date);

  const entry = await prisma.tipEntry.create({
    data: {
      tenantId,
      date,
      totalAmount,
      menaje: calc.menaje,
      netAmount: calc.netAmount,
      periodStart,
      periodEnd,
      notes: notes ?? null,
      distributions: {
        create: calc.distributions.map((d) => ({
          tenantId,
          employeeId: d.employeeId,
          hoursWorked: d.hoursWorked,
          tipPercent: d.tipPercent,
          effectiveHours: d.effectiveHours,
          amount: d.amount,
        })),
      },
    },
    include: {
      distributions: {
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { amount: "desc" },
      },
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}
