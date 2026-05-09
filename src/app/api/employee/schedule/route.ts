import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session || !["EMPLOYEE", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const employeeId = session.user.employeeId;
  if (!employeeId) return NextResponse.json({ schedule: null });

  const tenantId = session.user.tenantId;
  const schedule = await prisma.schedule.findFirst({
    where: {
      tenantId,
      published: true,
      shifts: { some: { employeeId } },
    },
    include: {
      shifts: {
        where: { employeeId },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { weekStart: "desc" },
  });

  return NextResponse.json({ schedule });
}
