import { prisma } from "@/lib/db";
import { calculateTips } from "@/lib/tips";
import { calculateHours } from "@/lib/payroll";

/**
 * Si existe un TipEntry para `date`, recalcula sus distribuciones
 * usando las horas actuales de los TimeEntries de ese día.
 * Llamar después de cualquier mutación de TimeEntry (create/update/delete).
 */
export async function recalculateTipForDate(tenantId: string, date: string) {
  const tipEntry = await prisma.tipEntry.findUnique({
    where: { tenantId_date: { tenantId, date } },
  });
  if (!tipEntry) return;

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

  const employeeInputs = Array.from(hoursMap.values()).map((v) => ({
    id: v.employee.id,
    name: v.employee.name,
    hoursWorked: Math.round(v.hours * 100) / 100,
    tipPercent: Number(v.employee.tipPercent),
  }));

  const calc = calculateTips(tipEntry.totalAmount, employeeInputs);

  await prisma.$transaction([
    prisma.tipDistribution.deleteMany({ where: { tipEntryId: tipEntry.id } }),
    prisma.tipEntry.update({
      where: { id: tipEntry.id },
      data: { menaje: calc.menaje, netAmount: calc.netAmount },
    }),
  ]);

  if (calc.distributions.length > 0) {
    await prisma.tipDistribution.createMany({
      data: calc.distributions.map((d) => ({
        tenantId,
        tipEntryId: tipEntry.id,
        employeeId: d.employeeId,
        hoursWorked: d.hoursWorked,
        tipPercent: d.tipPercent,
        effectiveHours: d.effectiveHours,
        amount: d.amount,
      })),
    });
  }
}
