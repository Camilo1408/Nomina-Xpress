import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSpecialDay } from "@/lib/holidays";

const createSchema = z.object({
  employeeId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkIn: z.string(),
  checkOut: z.string().nullable().optional(),
  checkIn2: z.string().nullable().optional(),
  checkOut2: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const employeeId = url.searchParams.get("employeeId");

  const entries = await prisma.timeEntry.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(from && to ? { date: { gte: from, lte: to } } : {}),
      ...(employeeId ? { employeeId } : {}),
    },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: [{ date: "desc" }, { checkIn: "desc" }],
  });
  return NextResponse.json(entries);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, checkIn, checkOut, checkIn2, checkOut2, employeeId, notes } = parsed.data;
  const special = isSpecialDay(date);

  const entry = await prisma.timeEntry.create({
    data: {
      tenantId: session.user.tenantId,
      employeeId,
      date,
      checkIn: new Date(checkIn),
      checkOut: checkOut ? new Date(checkOut) : null,
      checkIn2: checkIn2 ? new Date(checkIn2) : null,
      checkOut2: checkOut2 ? new Date(checkOut2) : null,
      isSpecial: special,
      notes: notes ?? null,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
