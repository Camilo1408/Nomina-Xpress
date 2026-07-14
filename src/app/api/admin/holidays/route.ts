import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permission-keys";
import { sessionCan } from "@/lib/get-permissions";
import { affectedDatesForHoliday, recalculateSpecialForDates } from "@/lib/special-days";
import { isValidCalendarDate } from "@/lib/holidays";

const createSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    year: z.number().int().min(2000).max(2100).nullable().default(null),
  })
  .refine((v) => isValidCalendarDate(v.month, v.day, v.year), {
    message: "La fecha no es válida",
    path: ["day"],
  });

export async function GET() {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.HOLIDAYS_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const holidays = await prisma.holiday.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ month: "asc" }, { day: "asc" }],
  });
  return NextResponse.json(holidays);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.HOLIDAYS_CREATE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, month, day, year } = parsed.data;

  // Unicidad por (tenant, year, month, day) — refleja el @@unique del schema.
  const exists = await prisma.holiday.findFirst({
    where: { tenantId, year, month, day },
    select: { id: true },
  });
  if (exists) {
    return NextResponse.json(
      { error: "Ya existe un festivo registrado para esa fecha" },
      { status: 409 }
    );
  }

  const holiday = await prisma.holiday.create({
    data: { tenantId, name, month, day, year },
  });

  // Recálculo retroactivo: marca como especiales los turnos ya registrados en
  // las fechas que este festivo cubre.
  const dates = await affectedDatesForHoliday(tenantId, holiday);
  const recalculated = await recalculateSpecialForDates(tenantId, dates);

  await logAudit(req, session, {
    action: "CREATE",
    module: "HOLIDAYS",
    entityId: holiday.id,
    entityLabel: name,
    description: `Registró el festivo "${name}" (${year ?? "cada año"}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}). ${recalculated} turno(s) recalculado(s).`,
    after: { name, month, day, year },
  });

  return NextResponse.json({ ...holiday, recalculated }, { status: 201 });
}
