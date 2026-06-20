import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { TimeEntryForm } from "@/components/admin/time-entries/TimeEntryForm";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

export default async function EditTimeEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requirePagePermission(PERMISSIONS.TIME_ENTRIES_EDIT);
  const { id } = await params;

  const [entry, employees] = await Promise.all([
    prisma.timeEntry.findFirst({
      where: { id, tenantId: session.user.tenantId },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.user.tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!entry) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Editar Registro</h1>
        <p className="text-sm text-[#7A6358] mt-1">{entry.date}</p>
      </div>
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6">
        <TimeEntryForm
          employees={employees}
          entry={{
            id: entry.id,
            employeeId: entry.employeeId,
            date: entry.date,
            checkIn: entry.checkIn.toISOString(),
            checkOut: entry.checkOut?.toISOString() ?? null,
            notes: entry.notes,
            isSpecial: entry.isSpecial,
          }}
        />
      </div>
    </div>
  );
}
