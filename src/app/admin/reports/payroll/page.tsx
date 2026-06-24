import { prisma } from "@/lib/db";
import { ReportsClient } from "@/components/admin/reports/ReportsClient";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

export default async function ReportsPayrollPage() {
  const { session, permissions } = await requirePagePermission(PERMISSIONS.PAYROLL_VIEW);
  const tenantId = session.user.tenantId;

  const employees = await prisma.employee.findMany({
    where: { tenantId, active: true, payType: "PAYROLL" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Reportes de Nómina</h1>
        <p className="text-sm text-[#7A6358] mt-1">
          Calcula y exporta el reporte de nómina por período (personal con pago de nómina)
        </p>
      </div>
      <ReportsClient
        employees={employees}
        reportType="payroll"
        canExportPdf={permissions.has(PERMISSIONS.PAYROLL_EXPORT_PDF)}
        canExportExcel={permissions.has(PERMISSIONS.PAYROLL_EXPORT_EXCEL)}
        canAddAdjustment={permissions.has(PERMISSIONS.PAY_ADJUSTMENTS_CREATE)}
        canEditAdjustment={permissions.has(PERMISSIONS.PAY_ADJUSTMENTS_EDIT)}
        canDeleteAdjustment={permissions.has(PERMISSIONS.PAY_ADJUSTMENTS_DELETE)}
      />
    </div>
  );
}
