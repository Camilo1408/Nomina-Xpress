import { prisma } from "@/lib/db";
import { calculateTips, type TipEmployeeInput, type TipCalculation } from "@/lib/tips";
import { calculateHours } from "@/lib/payroll";
import { resolveContestDeductionsForDate } from "@/lib/contest-service";
import type { Prisma } from "@/generated/prisma";

/**
 * Horas efectivas por empleado activo en un día, sumando ambos turnos.
 *
 * Extraído aquí porque el mismo bloque estaba repetido en POST /api/admin/tips,
 * PUT /api/admin/tips/[id] y en el recálculo. Con las reservas de concurso en
 * juego, tres copias del cálculo eran tres sitios donde el reparto podía
 * divergir.
 */
export async function collectEmployeeHoursForDate(
  tenantId: string,
  date: string
): Promise<TipEmployeeInput[]> {
  const timeEntries = await prisma.timeEntry.findMany({
    where: { tenantId, date },
    include: { employee: { select: { id: true, name: true, tipPercent: true, active: true } } },
  });

  const hoursMap = new Map<
    string,
    { employee: { id: string; name: string; tipPercent: number }; hours: number }
  >();

  for (const te of timeEntries) {
    if (!te.employee.active) continue;
    const prev = hoursMap.get(te.employeeId) ?? { employee: te.employee, hours: 0 };
    let h = 0;
    if (te.checkOut) h += calculateHours(te.checkIn, te.checkOut);
    if (te.checkIn2 && te.checkOut2) h += calculateHours(te.checkIn2, te.checkOut2);
    hoursMap.set(te.employeeId, { employee: te.employee, hours: prev.hours + h });
  }

  return Array.from(hoursMap.values()).map((v) => ({
    id: v.employee.id,
    name: v.employee.name,
    hoursWorked: Math.round(v.hours * 100) / 100,
    tipPercent: Number(v.employee.tipPercent),
  }));
}

/**
 * Calcula el reparto de un día con las deducciones de concurso vigentes.
 * No escribe nada: sirve tanto para persistir como para previsualizar.
 */
export async function computeTipsForDate(
  tenantId: string,
  date: string,
  totalAmount: number
): Promise<{ calc: TipCalculation; employees: TipEmployeeInput[] }> {
  const [employees, deductions] = await Promise.all([
    collectEmployeeHoursForDate(tenantId, date),
    resolveContestDeductionsForDate(tenantId, date),
  ]);
  return { calc: calculateTips(totalAmount, employees, deductions), employees };
}

/**
 * Persiste el resultado de un cálculo sobre un TipEntry existente: reconstruye
 * las distribuciones y sincroniza las reservas de concurso.
 *
 * Toda reserva RESERVADA que ya no figure en el cálculo se marca DEVUELTA en vez
 * de borrarse. Ese detalle es lo que hace que cancelar un concurso o declarar un
 * ítem desierto no necesiten un camino de código propio: basta con cambiar el
 * estado y recalcular — la reserva deja de aplicar y el dinero vuelve al reparto,
 * quedando el registro histórico de que existió.
 */
export async function persistTipCalculation(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    tipEntryId: string;
    date: string;
    calc: TipCalculation;
    reason: string;
  }
): Promise<void> {
  const { tenantId, tipEntryId, date, calc, reason } = params;

  await tx.tipDistribution.deleteMany({ where: { tipEntryId } });

  await tx.tipEntry.update({
    where: { id: tipEntryId },
    data: {
      menaje: calc.menaje,
      netAmount: calc.netAmount,
      contestReserved: calc.contestReserved,
    },
  });

  for (const r of calc.contestReserves) {
    await tx.contestTipReserve.upsert({
      where: { tipEntryId_contestItemId: { tipEntryId, contestItemId: r.contestItemId } },
      create: {
        tenantId,
        contestId: r.contestId,
        contestItemId: r.contestItemId,
        tipEntryId,
        date,
        tipTotalAmount: calc.totalAmount,
        percent: r.percent,
        amount: r.amount,
        status: "RESERVADA",
      },
      update: {
        tipTotalAmount: calc.totalAmount,
        percent: r.percent,
        amount: r.amount,
        status: "RESERVADA",
        refundedAt: null,
        refundReason: null,
      },
    });
  }

  const keptIds = calc.contestReserves.map((r) => r.contestItemId);
  await tx.contestTipReserve.updateMany({
    where: {
      tipEntryId,
      status: "RESERVADA",
      ...(keptIds.length > 0 ? { contestItemId: { notIn: keptIds } } : {}),
    },
    data: { status: "DEVUELTA", refundedAt: new Date(), refundReason: reason },
  });

  if (calc.distributions.length > 0) {
    await tx.tipDistribution.createMany({
      data: calc.distributions.map((d) => ({
        tenantId,
        tipEntryId,
        employeeId: d.employeeId,
        hoursWorked: d.hoursWorked,
        tipPercent: d.tipPercent,
        effectiveHours: d.effectiveHours,
        amount: d.amount,
      })),
    });
  }
}

/**
 * Si existe un TipEntry para `date`, recalcula sus distribuciones usando las
 * horas actuales de los TimeEntries de ese día y las deducciones de concurso
 * vigentes.
 *
 * Llamar después de cualquier mutación de TimeEntry (create/update/delete) y de
 * cualquier cambio de estado de un concurso.
 */
export async function recalculateTipForDate(
  tenantId: string,
  date: string,
  reason = "Recálculo de propinas"
): Promise<void> {
  const tipEntry = await prisma.tipEntry.findUnique({
    where: { tenantId_date: { tenantId, date } },
  });
  if (!tipEntry) return;

  const { calc } = await computeTipsForDate(tenantId, date, tipEntry.totalAmount);

  await prisma.$transaction(async (tx) => {
    await persistTipCalculation(tx, {
      tenantId,
      tipEntryId: tipEntry.id,
      date,
      calc,
      reason,
    });
  });
}
