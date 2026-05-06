import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { calculatePayroll } from "@/lib/payroll";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const employeeId = session.user.employeeId;
  if (!employeeId) {
    return NextResponse.json({ error: "No employee linked" }, { status: 400 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to required" }, { status: 400 });
  }

  const tenantId = session.user.tenantId;
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
  });

  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [entries, adjustments] = await Promise.all([
    prisma.timeEntry.findMany({ where: { tenantId, employeeId, date: { gte: from, lte: to } } }),
    prisma.payAdjustment.findMany({ where: { tenantId, employeeId, periodStart: { gte: from }, periodEnd: { lte: to } } }),
  ]);

  const result = calculatePayroll(employee, entries, adjustments);
  return NextResponse.json({ period: { from, to }, ...result });
}
