import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { calculatePayroll } from "@/lib/payroll";
import { resolveBonusesForEmployees } from "@/lib/bonus-service";
import { resolveDiscountsForEmployees } from "@/lib/discount-service";
import { clampFinalPay } from "@/lib/discounts";
import { fetchPayrollPeriodData } from "@/lib/payroll-report";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.PAYROLL_VIEW))) {
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

  // Carga en bloque (3 queries) en vez de 3 por empleado (N+1).
  const periodData = await fetchPayrollPeriodData(tenantId, from, to, employees.map((e) => e.id));

  const results = employees.map((emp) => {
      const { entries, adjustments, tipDists } = periodData.get(emp.id)!;
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
        // Las propinas son informativas y NO se suman al total final a pagar.
        finalPay: clampFinalPay(payroll.netPay, empBonuses.totalBonuses, empDiscounts.totalDiscounts),
        tipDistributions: tipDists.map((d) => ({
          date: d.tipEntry.date,
          amount: Number(d.amount),
          hoursWorked: Number(d.hoursWorked),
          tipPercent: Number(d.tipPercent),
        })),
      };
    });

  return NextResponse.json({ period: { from, to }, employees: results });
}
