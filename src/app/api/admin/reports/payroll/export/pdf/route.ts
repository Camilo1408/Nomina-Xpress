import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculatePayroll } from "@/lib/payroll";
import { resolveBonusesForEmployees } from "@/lib/bonus-service";
import { resolveDiscountsForEmployees } from "@/lib/discount-service";
import { clampFinalPay } from "@/lib/discounts";
import { loadTenantLogo } from "@/lib/logo-loader";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !["SUPERADMIN", "PROPRIETARY"].includes(session.user.role)) {
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
    resolveBonusesForEmployees(tenantId, from, empRefs),
    resolveDiscountsForEmployees(tenantId, from, empRefs),
  ]);

  const results = await Promise.all(
    employees.map(async (emp) => {
      const [entries, adjustments, tipDists] = await Promise.all([
        prisma.timeEntry.findMany({ where: { tenantId, employeeId: emp.id, date: { gte: from, lte: to } } }),
        prisma.payAdjustment.findMany({ where: { tenantId, employeeId: emp.id, periodStart: { gte: from }, periodEnd: { lte: to } } }),
        prisma.tipDistribution.findMany({ where: { tenantId, employeeId: emp.id, tipEntry: { date: { gte: from, lte: to } } } }),
      ]);
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
        finalPay: clampFinalPay(netPayWithTips, empBonuses.totalBonuses, empDiscounts.totalDiscounts),
      };
    })
  );

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { PayrollPDF } = await import("@/lib/pdf/payroll-template");
  const logo = await loadTenantLogo(tenant?.logoUrl);

  const buffer = await renderToBuffer(
    PayrollPDF({
      tenantName: tenant?.name ?? "Restaurante",
      period: { from, to },
      employees: results,
      primaryColor: tenant?.primaryColor ?? "#C1643F",
      reportType,
      logo,
    })
  );

  const fileSlug = reportType === "shifts" ? "turnos" : "nomina";
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileSlug}-${from}-${to}.pdf"`,
    },
  });
}
