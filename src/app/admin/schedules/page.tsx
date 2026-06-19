import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { ScheduleActions } from "@/components/admin/schedules/ScheduleActions";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

export default async function SchedulesPage() {
  const { session, permissions } = await requirePagePermission(PERMISSIONS.SCHEDULES_VIEW);
  const tenantId = session.user.tenantId;
  const canCreate = permissions.has(PERMISSIONS.SCHEDULES_CREATE);
  const canEdit = permissions.has(PERMISSIONS.SCHEDULES_EDIT);
  const canPublish = permissions.has(PERMISSIONS.SCHEDULES_PUBLISH);
  const canDelete = permissions.has(PERMISSIONS.SCHEDULES_DELETE);

  const schedules = await prisma.schedule.findMany({
    where: { tenantId },
    include: { shifts: { include: { employee: { select: { name: true } } } } },
    orderBy: { weekStart: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Horarios</h1>
          <p className="text-sm text-[#7A6358] mt-1">{schedules.length} horarios creados</p>
        </div>
        {canCreate && (
          <Link href="/admin/schedules/new">
            <Button className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-2">
              <Plus className="w-4 h-4" /> Nuevo horario
            </Button>
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {schedules.map((sched) => {
          const uniqueEmployees = [...new Set(sched.shifts.map((s) => s.employee.name))];
          return (
            <div key={sched.id} className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between overflow-hidden">
              <Link href={`/admin/schedules/${sched.id}/view`} className="flex-1 p-4 hover:bg-[#F2EDE6]/50 transition-colors min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-[#2C1F15]">{sched.name}</p>
                  <Badge className={sched.published ? "bg-[#6B8E6B]/15 text-[#6B8E6B] border-0" : "bg-[#7A6358]/10 text-[#7A6358] border-0"}>
                    {sched.published ? "Publicado" : "Borrador"}
                  </Badge>
                </div>
                <p className="text-sm text-[#7A6358] mt-0.5">
                  Semana: {sched.weekStart} — {sched.shifts.length} turnos
                  {uniqueEmployees.length > 0 && ` — ${uniqueEmployees.slice(0, 3).join(", ")}${uniqueEmployees.length > 3 ? "..." : ""}`}
                </p>
              </Link>
              <div className="px-4 pb-4 sm:pb-0 sm:pr-4 flex-shrink-0">
                <ScheduleActions
                  scheduleId={sched.id}
                  published={sched.published}
                  canEdit={canEdit}
                  canPublish={canPublish}
                  canDelete={canDelete}
                />
              </div>
            </div>
          );
        })}
        {schedules.length === 0 && (
          <div className="text-center py-12 text-[#7A6358]">
            No hay horarios.{" "}
            {canCreate && (
              <Link href="/admin/schedules/new" className="text-[#C1643F] hover:underline">Crear el primero</Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
