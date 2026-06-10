import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { calculatePayroll } from "@/lib/payroll";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !["ADMIN", "SUPERADMIN", "PROPRIETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const employeeId = url.searchParams.get("employeeId");
  const typeParam = url.searchParams.get("type");
  const payType = typeParam === "shifts" ? "SHIFT" : typeParam === "payroll" ? "PAYROLL" : null;

  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  const tenantId = session.user.tenantId;

  const employees = await prisma.employee.findMany({
    where: {
      tenantId,
      active: true,
      ...(payType ? { payType } : {}),
      ...(employeeId ? { id: employeeId } : {}),
    },
  });

  const results = await Promise.all(
    employees.map(async (emp) => {
      const [entries, adjustments, tipDists] = await Promise.all([
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
        prisma.tipDistribution.findMany({
          where: {
            tenantId,
            employeeId: emp.id,
            tipEntry: { date: { gte: from, lte: to } },
          },
          include: { tipEntry: { select: { date: true } } },
        }),
      ]);
      const payroll = calculatePayroll(emp, entries, adjustments);
      const totalTips = tipDists.reduce((s, d) => s + Number(d.amount), 0);
      return {
        ...payroll,
        totalTips: Math.round(totalTips),
        netPayWithTips: Math.round(payroll.netPay + totalTips),
        tipDistributions: tipDists.map((d) => ({
          date: d.tipEntry.date,
          amount: Number(d.amount),
          hoursWorked: Number(d.hoursWorked),
          tipPercent: Number(d.tipPercent),
        })),
      };
    })
  );

  return NextResponse.json({ period: { from, to }, employees: results });
}
