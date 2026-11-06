import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { toShiftDTO } from "@/lib/schedule-shifts";
import { forbidden, unauthorized } from "@/lib/api-response";

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();
  if (!["EMPLOYEE", "ADMIN"].includes(session.user.role)) return forbidden();

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
