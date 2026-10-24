import "server-only";

// Solo servidor: carga las propinas del rango desde Prisma y las agrega.
// Mismo filtro de fechas que GET /api/admin/tips.
import { prisma } from "@/lib/db";
import { aggregateTipsReport, TIPS_REPORT_CONTEST_STATUSES, type TipsReport } from "@/lib/tips-report";

export async function fetchTipsReport(tenantId: string, from: string, to: string): Promise<TipsReport> {
  const [entries, contests] = await Promise.all([
    prisma.tipEntry.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
      include: {
        distributions: {
          include: { employee: { select: { name: true } } },
          orderBy: { amount: "desc" },
        },
      },
      orderBy: { date: "asc" },
    }),
    // Concursos cerrados cuyo último día cae en el rango: se informan en el
    // reporte del período en que terminaron, aunque se paguen en la quincena
    // siguiente. Las cifras son las de TODO el concurso, no solo las del rango.
    prisma.contest.findMany({
      where: {
        tenantId,
        status: { in: [...TIPS_REPORT_CONTEST_STATUSES] },
        endDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        payoutMode: true,
        items: {
          select: {
            name: true,
            goalValue: true,
            goalUnit: true,
            percent: true,
            outcome: true,
            reserves: { where: { tenantId, status: "RESERVADA" }, select: { amount: true } },
            bonuses: {
              where: { tenantId },
              select: {
                resultValue: true,
                totalAmount: true,
                status: true,
                employee: { select: { name: true } },
                payments: {
                  select: { installment: true, periodStart: true, periodEnd: true, amount: true, status: true },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);
  return aggregateTipsReport(entries, contests);
}
