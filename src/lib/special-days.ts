import "server-only";
import { prisma } from "@/lib/db";
import { dateFromString, isColombianHoliday } from "@/lib/holidays";
import { recalculateTipForDate } from "@/lib/recalculate-tips";
import type { Holiday } from "@/generated/prisma";

/**
 * Versión tenant-aware de `isSpecialDay`. Un día es especial si es:
 *   1. Domingo, o
 *   2. Festivo NACIONAL colombiano (librería `date-holidays`), o
 *   3. Festivo PERSONALIZADO del cliente registrado en la tabla `Holiday`
 *      (coincidencia por mes/día, con `year = null` recurrente o `year` puntual).
 *
 * Es la fuente de verdad que se persiste en `TimeEntry.isSpecial` al crear/editar
 * turnos. Recibe la fecha como "YYYY-MM-DD".
 */
export async function isSpecialDayForTenant(tenantId: string, dateStr: string): Promise<boolean> {
  const date = dateFromString(dateStr);
  // Domingo o festivo nacional: resolución síncrona, sin tocar la BD.
  if (date.getUTCDay() === 0 || isColombianHoliday(date)) return true;

  // Festivo personalizado del cliente.
  const [year, month, day] = dateStr.split("-").map(Number);
  const custom = await prisma.holiday.findFirst({
    where: {
      tenantId,
      month,
      day,
      OR: [{ year: null }, { year }],
    },
    select: { id: true },
  });
  return custom !== null;
}

/**
 * Recalcula `TimeEntry.isSpecial` para un conjunto de fechas y recalcula las
 * propinas asociadas. Se llama tras crear/editar/eliminar un festivo para que
 * los turnos YA registrados en esas fechas pasen a pagarse (o dejen de pagarse)
 * como día especial — sin re-registrarlos manualmente.
 */
export async function recalculateSpecialForDates(tenantId: string, dates: string[]): Promise<number> {
  const unique = [...new Set(dates)];
  let affected = 0;
  for (const date of unique) {
    const special = await isSpecialDayForTenant(tenantId, date);
    const res = await prisma.timeEntry.updateMany({
      where: { tenantId, date },
      data: { isSpecial: special },
    });
    affected += res.count;
    // Las propinas se reparten por horas trabajadas, no dependen de isSpecial,
    // pero mantenemos el recálculo por consistencia con el resto de mutaciones.
    await recalculateTipForDate(tenantId, date);
  }
  return affected;
}

/**
 * Devuelve las fechas concretas ("YYYY-MM-DD") con turnos registrados que se ven
 * afectadas por un festivo, para recalcular su `isSpecial`:
 *   - Festivo puntual (year != null): la única fecha exacta.
 *   - Festivo recurrente (year == null): todas las fechas con turnos cuyo mes/día
 *     coincidan, en cualquier año.
 */
export async function affectedDatesForHoliday(
  tenantId: string,
  holiday: Pick<Holiday, "year" | "month" | "day">
): Promise<string[]> {
  const mm = String(holiday.month).padStart(2, "0");
  const dd = String(holiday.day).padStart(2, "0");

  if (holiday.year !== null) {
    return [`${holiday.year}-${mm}-${dd}`];
  }

  const rows = await prisma.timeEntry.findMany({
    where: { tenantId, date: { endsWith: `-${mm}-${dd}` } },
    select: { date: true },
    distinct: ["date"],
  });
  return rows.map((r) => r.date);
}
