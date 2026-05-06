import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSpecialDay } from "@/lib/holidays";

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().nullable().optional(),
  checkIn2: z.string().nullable().optional(),
  checkOut2: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, checkIn, checkOut, checkIn2, checkOut2, notes } = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (date !== undefined) {
    updateData.date = date;
    updateData.isSpecial = isSpecialDay(date);
  }
  if (checkIn !== undefined) updateData.checkIn = new Date(checkIn);
  if (checkOut !== undefined) updateData.checkOut = checkOut ? new Date(checkOut) : null;
  if (checkIn2 !== undefined) updateData.checkIn2 = checkIn2 ? new Date(checkIn2) : null;
  if (checkOut2 !== undefined) updateData.checkOut2 = checkOut2 ? new Date(checkOut2) : null;
  if (notes !== undefined) updateData.notes = notes;

  await prisma.timeEntry.updateMany({
    where: { id, tenantId: session.user.tenantId },
    data: updateData,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.timeEntry.deleteMany({ where: { id, tenantId: session.user.tenantId } });
  return NextResponse.json({ success: true });
}
