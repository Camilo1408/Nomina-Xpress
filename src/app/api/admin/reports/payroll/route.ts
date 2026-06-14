import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { calculatePayroll } from "@/lib/payroll";
import { resolveBonusesForEmployees } from "@/lib/bonus-service";
import { resolveDiscountsForEmployees } from "@/lib/discount-service";
import { clampFinalPay } from "@/lib/discounts";

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

  // Bonos y descuentos aplicables a los empleados del reporte para este período (quincena)
  const empRefs = employees.map((e) => ({ id: e.id, payType: e.payType }));
  const [bonusMap, discountMap] = await Promise.all([
    resolveBonusesForEmployees(tenantId, from, empRefs),
    resolveDiscountsForEmployees(tenantId, from, empRefs),
  ]);

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
      const empBonuses = bonusMap.get(emp.id) ?? { bonuses: [], totalBonuses: 0 };
      const empDiscounts = discountMap.get(emp.id) ?? { discounts: [], totalDiscounts: 0 };
      const netPayWithTips = Math.round(payroll.netPay + totalTips);
      return {
        ...payroll,
        totalTips: Math.round(totalTips),
        netPayWithTips,
        bonuses: empBonuses.bonuses,
        totalBonuses: empBonuses.totalBonuses,
        discounts: empDiscounts.discounts,
        totalDiscounts: empDiscounts.totalDiscounts,
        finalPay: clampFinalPay(netPayWithTips, empBonuses.totalBonuses, empDiscounts.totalDiscounts),
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
