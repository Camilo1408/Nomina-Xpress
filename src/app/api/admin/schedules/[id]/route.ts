import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { buildRestDayShift, buildWorkShift } from "@/lib/schedule-shifts";
import { employeesInSchedule, notifyScheduleEmployees } from "@/lib/schedule-notify";
import { forbidden, readJsonBody, unauthorized } from "@/lib/api-response";

const shiftSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  startTime2: z.string().nullable().optional(),
  endTime2: z.string().nullable().optional(),
  restDay: z.boolean().optional().default(false),
});

const updateSchema = z.object({
  name: z.string().optional(),
  weekStart: z.string().optional(),
  shifts: z.array(shiftSchema).optional(),
});

/** Igual que en la ruta de creación: el descanso se construye en el servidor. */
function toShiftRow(s: z.infer<typeof shiftSchema>) {
  return s.restDay
    ? buildRestDayShift(s.employeeId, s.date)
    : buildWorkShift(s);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.SCHEDULES_EDIT))) return forbidden();
  const { id } = await params;
  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.response;
  const body = raw.body;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.schedule.findFirst({ where: { id, tenantId: session.user.tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, weekStart, shifts } = parsed.data;
  if (shifts) {
    // Validar que todos los empleados referenciados pertenezcan al tenant
    const shiftEmployeeIds = [...new Set(shifts.map((s) => s.employeeId))];
    if (shiftEmployeeIds.length > 0) {
      const validCount = await prisma.employee.count({
        where: { id: { in: shiftEmployeeIds }, tenantId: session.user.tenantId },
      });
      if (validCount !== shiftEmployeeIds.length) {
        return NextResponse.json(
          { error: "Uno o más empleados no pertenecen a este restaurante" },
          { status: 400 }
        );
      }
    }
    await prisma.scheduleShift.deleteMany({ where: { scheduleId: id } });
    await prisma.scheduleShift.createMany({
      data: shifts.map((s) => ({ scheduleId: id, ...toShiftRow(s) })),
    });
  }
  if (name || weekStart) {
    await prisma.schedule.update({
      where: { id },
      data: { ...(name ? { name } : {}), ...(weekStart ? { weekStart } : {}) },
    });
  }

  // Un horario ya publicado es el que el personal está mirando: si se edita, se avisa a
  // todos los que figuran en él tal como quedó, con turno o con descanso, les haya cambiado
  // algo o no. Quien no tiene nada asignado no recibe aviso. Un borrador no avisa a nadie.
  if (existing.published && (shifts || weekStart)) {
    const current = shifts ?? (await prisma.scheduleShift.findMany({ where: { scheduleId: id }, select: { employeeId: true } }));
    await notifyScheduleEmployees(session.user.tenantId, employeesInSchedule(current), {
      title: "📅 Horario actualizado",
      body: `Se actualizó el horario "${name ?? existing.name}". Revisa cómo quedó tu semana.`,
      url: "/portal/schedule",
    });
  }

  await logAudit(req, session, {
    action: "UPDATE",
    module: "SCHEDULES",
    entityId: id,
    entityLabel: name ?? existing.name,
    description: `Editó el horario "${existing.name}"${
      shifts ? ` (${shifts.length} turno(s))` : ""
    }`,
    before: { name: existing.name },
    after: { name: name ?? existing.name, shiftsCount: shifts?.length },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.SCHEDULES_DELETE))) return forbidden();
  const { id } = await params;
  const existing = await prisma.schedule.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  await prisma.schedule.deleteMany({ where: { id, tenantId: session.user.tenantId } });

  if (existing) {
    await logAudit(req, session, {
      action: "DELETE",
      module: "SCHEDULES",
      entityId: id,
      entityLabel: existing.name,
      description: `Eliminó el horario "${existing.name}" (semana ${existing.weekStart})`,
      before: existing,
    });
  }

  return NextResponse.json({ success: true });
}
