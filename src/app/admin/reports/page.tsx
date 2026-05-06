import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ReportsClient } from "@/components/admin/reports/ReportsClient";

export default async function ReportsPage() {
  const session = await auth();
  const tenantId = session!.user.tenantId;

  const employees = await prisma.employee.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Reportes de Nómina</h1>
        <p className="text-sm text-[#7A6358] mt-1">Calcula y exporta el reporte de nómina por período</p>
      </div>
      <ReportsClient employees={employees} />
    </div>
  );
}
