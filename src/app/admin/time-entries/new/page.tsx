import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TimeEntryForm } from "@/components/admin/time-entries/TimeEntryForm";

export default async function NewTimeEntryPage() {
  const session = await auth();
  const employees = await prisma.employee.findMany({
    where: { tenantId: session!.user.tenantId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Registrar Horas</h1>
        <p className="text-sm text-[#7A6358] mt-1">Registra la entrada y salida de un empleado</p>
      </div>
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6">
        <TimeEntryForm employees={employees} />
      </div>
    </div>
  );
}
