import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { PortalProfileClient } from "./PortalProfileClient";

export default async function PortalProfilePage() {
  const session = await auth();
  const employeeId = session!.user.employeeId;

  const employee = employeeId
    ? await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { name: true, documentId: true, phone: true, hourlyRateNormal: true, hourlyRateSpecial: true },
      })
    : null;

  const displayName = employee?.name ?? session!.user.name ?? "Personal";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Hola, {displayName}</h1>
        <p className="text-sm text-[#7A6358] mt-1">Cambia tu contraseña de acceso</p>
      </div>

      {employee && (
        <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6 max-w-md">
          <h2 className="text-sm font-semibold text-[#2C1F15] mb-4 uppercase tracking-wide">Mis datos</h2>
          <dl className="space-y-3">
            <div className="flex justify-between items-center py-1.5 border-b border-[#F2EDE6]">
              <dt className="text-sm text-[#7A6358]">Nombre</dt>
              <dd className="text-sm font-medium text-[#2C1F15]">{employee.name}</dd>
            </div>
            {employee.documentId && (
              <div className="flex justify-between items-center py-1.5 border-b border-[#F2EDE6]">
                <dt className="text-sm text-[#7A6358]">Cédula</dt>
                <dd className="text-sm font-mono text-[#2C1F15]">{employee.documentId}</dd>
              </div>
            )}
            {employee.phone && (
              <div className="flex justify-between items-center py-1.5 border-b border-[#F2EDE6]">
                <dt className="text-sm text-[#7A6358]">Teléfono</dt>
                <dd className="text-sm font-mono text-[#2C1F15]">{employee.phone}</dd>
              </div>
            )}
            <div className="flex justify-between items-center py-1.5 border-b border-[#F2EDE6]">
              <dt className="text-sm text-[#7A6358]">Hora normal</dt>
              <dd className="text-sm font-mono font-semibold text-[#2C1F15]">{formatCurrency(employee.hourlyRateNormal)}</dd>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <dt className="text-sm text-[#7A6358]">Hora especial</dt>
              <dd className="text-sm font-mono font-semibold text-[#C1643F]">{formatCurrency(employee.hourlyRateSpecial)}</dd>
            </div>
          </dl>
        </div>
      )}

      <PortalProfileClient />
    </div>
  );
}
