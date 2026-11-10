import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { employeesInSchedule, notifyScheduleEmployees } from "@/lib/schedule-notify";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { forbidden, unauthorized } from "@/lib/api-response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.SCHEDULES_PUBLISH))) return forbidden();

  const { id } = await params;
  const schedule = await prisma.schedule.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: { shifts: { select: { employeeId: true } } },
  });
  if (!schedule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newPublished = !schedule.published;

  // Solo puede haber UN horario publicado a la vez. Al publicar uno nuevo se
  // despublican los demás: el portal del empleado muestra el horario publicado
  // más reciente, y con dos publicados a la vez el personal podría estar
  // mirando una semana vieja o quedarse con turnos de dos horarios distintos.
  //
  // Se hace en una transacción con la publicación para que no exista ni un
  // instante con dos horarios publicados.
  const desplazados = newPublished
    ? await prisma.schedule.findMany({
        where: {
          tenantId: session.user.tenantId,
          published: true,
          id: { not: id },
        },
        select: { id: true, name: true },
      })
    : [];

  await prisma.$transaction([
    ...(desplazados.length > 0
      ? [
          prisma.schedule.updateMany({
            where: { id: { in: desplazados.map((d) => d.id) } },
            data: { published: false },
          }),
        ]
      : []),
    prisma.schedule.update({
      where: { id },
      data: { published: newPublished },
    }),
  ]);

  // Al publicar se avisa a todos los que figuran en el horario, con turno o con descanso.
  // Quien no tiene nada asignado no recibe aviso.
  if (newPublished) {
    await notifyScheduleEmployees(session.user.tenantId, employeesInSchedule(schedule.shifts), {
      title: "📅 Horario actualizado",
      body: `Se publicó el horario "${schedule.name}". ¡Revísalo ahora!`,
      url: "/portal/schedule",
    });
  }

  const desplazadosTexto = desplazados.map((d) => `"${d.name}"`).join(", ");

  await logAudit(req, session, {
    action: newPublished ? "PUBLISH" : "UNPUBLISH",
    module: "SCHEDULES",
    entityId: id,
    entityLabel: schedule.name,
    description:
      `${newPublished ? "Publicó" : "Despublicó"} el horario "${schedule.name}"` +
      (desplazados.length > 0
        ? ` y despublicó automáticamente ${desplazadosTexto}`
        : ""),
    before: { published: schedule.published },
    after: {
      published: newPublished,
      despublicados: desplazados.map((d) => d.name),
    },
  });

  return NextResponse.json({
    success: true,
    published: newPublished,
    unpublished: desplazados.map((d) => d.name),
  });
}
