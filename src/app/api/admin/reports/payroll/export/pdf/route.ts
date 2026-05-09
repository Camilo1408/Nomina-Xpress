import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculatePayroll } from "@/lib/payroll";
import { NextResponse } from "next/server";
import { formatCurrency, formatHours } from "@/lib/utils";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "SUPERADMIN") {
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

  // Generate PDF using @react-pdf/renderer server-side
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { PayrollPDF } = await import("@/lib/pdf/payroll-template");

  const buffer = await renderToBuffer(
    PayrollPDF({
      tenantName: tenant?.name ?? "Restaurante",
      period: { from, to },
      employees: results,
      primaryColor: tenant?.primaryColor ?? "#C1643F",
    })
  );

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="nomina-${from}-${to}.pdf"`,
    },
  });
}
