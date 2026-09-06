import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculatePayroll } from "@/lib/payroll";
import { resolveBonusesForEmployees } from "@/lib/bonus-service";
import { resolveDiscountsForEmployees } from "@/lib/discount-service";
import { clampFinalPay } from "@/lib/discounts";
import { fetchPayrollPeriodData } from "@/lib/payroll-report";
import { generatePayrollExcel } from "@/lib/excel/payroll-template";
import { loadTenantLogo } from "@/lib/logo-loader";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.PAYROLL_EXPORT_EXCEL))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const typeParam = url.searchParams.get("type");
  const reportType: "payroll" | "shifts" = typeParam === "shifts" ? "shifts" : "payroll";
  const payType = reportType === "shifts" ? "SHIFT" : "PAYROLL";

  if (!from || !to) {
    return NextResponse.json({ error: "from and to required" }, { status: 400 });
  }

  const tenantId = session.user.tenantId;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const employees = await prisma.employee.findMany({ where: { tenantId, active: true, payType } });

  const empRefs = employees.map((e) => ({ id: e.id, payType: e.payType }));
  const [bonusMap, discountMap] = await Promise.all([
    resolveBonusesForEmployees(tenantId, from, to, empRefs),
    resolveDiscountsForEmployees(tenantId, from, to, empRefs),
  ]);

  const periodData = await fetchPayrollPeriodData(tenantId, from, to, employees.map((e) => e.id));

  const results = employees.map((emp) => {
      const { entries, adjustments, tipDists } = periodData.get(emp.id)!;
      const payroll = calculatePayroll(emp, entries, adjustments);
      const totalTips = Math.round(tipDists.reduce((s, d) => s + Number(d.amount), 0));
      const empBonuses = bonusMap.get(emp.id) ?? { bonuses: [], totalBonuses: 0 };
      const empDiscounts = discountMap.get(emp.id) ?? { discounts: [], totalDiscounts: 0 };
      const netPayWithTips = Math.round(payroll.netPay + totalTips);
      return {
        ...payroll,
        totalTips,
        netPayWithTips,
        bonuses: empBonuses.bonuses,
        totalBonuses: empBonuses.totalBonuses,
        discounts: empDiscounts.discounts,
        totalDiscounts: empDiscounts.totalDiscounts,
        // Las propinas son informativas y NO se suman al total final a pagar
        // (misma base que el reporte en pantalla: netPay, no netPayWithTips).
        finalPay: clampFinalPay(payroll.netPay, empBonuses.totalBonuses, empDiscounts.totalDiscounts),
      };
    });

  const logo = await loadTenantLogo(tenant?.logoUrl);
  const buffer = await generatePayrollExcel(
    { period: { from, to }, employees: results },
    tenant?.name ?? "Restaurante",
    tenant?.primaryColor ?? "#C1643F",
    reportType,
    logo
  );

  const fileSlug = reportType === "shifts" ? "turnos" : "nomina";

  await logAudit(req, session, {
    action: "EXPORT",
    module: "PAYROLL",
    description: `Exportó el reporte de ${reportType === "shifts" ? "turnos" : "nómina"} en Excel (${from} a ${to})`,
    after: { format: "EXCEL", reportType, from, to },
  });

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileSlug}-${from}-${to}.xlsx"`,
    },
  });
}
