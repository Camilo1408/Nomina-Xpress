import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculatePayroll } from "@/lib/payroll";
import { generatePayrollExcel } from "@/lib/excel/payroll-template";
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

  const results = await Promise.all(
    employees.map(async (emp) => {
      const [entries, adjustments, tipDists] = await Promise.all([
        prisma.timeEntry.findMany({ where: { tenantId, employeeId: emp.id, date: { gte: from, lte: to } } }),
        prisma.payAdjustment.findMany({ where: { tenantId, employeeId: emp.id, periodStart: { gte: from }, periodEnd: { lte: to } } }),
        prisma.tipDistribution.findMany({ where: { tenantId, employeeId: emp.id, tipEntry: { date: { gte: from, lte: to } } } }),
      ]);
      const payroll = calculatePayroll(emp, entries, adjustments);
      const totalTips = Math.round(tipDists.reduce((s, d) => s + Number(d.amount), 0));
      return { ...payroll, totalTips, netPayWithTips: Math.round(payroll.netPay + totalTips) };
    })
  );

  const logo = await loadTenantLogo(tenant?.logoUrl);
  const buffer = await generatePayrollExcel(
    { period: { from, to }, employees: results },
    tenant?.name ?? "Restaurante",
    tenant?.primaryColor ?? "#C1643F",
    reportType,
    logo
  );

  const fileSlug = reportType === "shifts" ? "turnos" : "nomina";
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileSlug}-${from}-${to}.xlsx"`,
    },
  });
}
