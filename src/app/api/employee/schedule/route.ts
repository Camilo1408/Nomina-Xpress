import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { toShiftDTO } from "@/lib/schedule-shifts";

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

  if (!schedule) return NextResponse.json({ schedule: null });

  // Un día de descanso guarda un centinela en sus horas; `toShiftDTO` lo
  // convierte en null para que nunca llegue al cliente.
  return NextResponse.json({
    schedule: { ...schedule, shifts: schedule.shifts.map(toShiftDTO) },
  });
}
