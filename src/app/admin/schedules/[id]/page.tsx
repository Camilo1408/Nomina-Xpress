import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ScheduleGrid } from "@/components/admin/schedules/ScheduleGrid";

export default async function EditSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const [schedule, employees] = await Promise.all([
    prisma.schedule.findFirst({
      where: { id, tenantId: session!.user.tenantId },
      include: { shifts: true },
    }),
    prisma.employee.findMany({
      where: { tenantId: session!.user.tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!schedule) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Editar Horario</h1>
        <p className="text-sm text-[#7A6358] mt-1">{schedule.name}</p>
      </div>
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6">
        <ScheduleGrid
          employees={employees}
          weekStart={schedule.weekStart}
          existingSchedule={{
            id: schedule.id,
            name: schedule.name,
            shifts: schedule.shifts,
          }}
        />
      </div>
    </div>
  );
}
