import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { calculatePayroll } from "@/lib/payroll";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const employeeId = url.searchParams.get("employeeId");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  const tenantId = session.user.tenantId;

  const employees = await prisma.employee.findMany({
    where: {
      tenantId,
      active: true,
      ...(employeeId ? { id: employeeId } : {}),
    },
  });

  const results = await Promise.all(
    employees.map(async (emp) => {
      const [entries, adjustments] = await Promise.all([
        prisma.timeEntry.findMany({
          where: { tenantId, employeeId: emp.id, date: { gte: from, lte: to } },
        }),
        prisma.payAdjustment.findMany({
          where: {
            tenantId,
            employeeId: emp.id,
            periodStart: { gte: from },
            periodEnd: { lte: to },
          },
        }),
      ]);
      return calculatePayroll(emp, entries, adjustments);
    })
  );

  return NextResponse.json({ period: { from, to }, employees: results });
}
