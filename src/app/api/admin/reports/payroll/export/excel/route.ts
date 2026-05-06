import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculatePayroll } from "@/lib/payroll";
import { generatePayrollExcel } from "@/lib/excel/payroll-template";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to required" }, { status: 400 });
  }

  const tenantId = session.user.tenantId;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const employees = await prisma.employee.findMany({ where: { tenantId, active: true } });

  const results = await Promise.all(
    employees.map(async (emp) => {
      const [entries, adjustments] = await Promise.all([
        prisma.timeEntry.findMany({ where: { tenantId, employeeId: emp.id, date: { gte: from, lte: to } } }),
        prisma.payAdjustment.findMany({ where: { tenantId, employeeId: emp.id, periodStart: { gte: from }, periodEnd: { lte: to } } }),
      ]);
      return calculatePayroll(emp, entries, adjustments);
    })
  );

  const buffer = await generatePayrollExcel(
    { period: { from, to }, employees: results },
    tenant?.name ?? "Restaurante",
    tenant?.primaryColor ?? "#C1643F"
  );

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="nomina-${from}-${to}.xlsx"`,
    },
  });
}
