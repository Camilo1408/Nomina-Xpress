import "server-only";

// Solo servidor: carga las propinas del rango desde Prisma y las agrega.
// Mismo filtro de fechas que GET /api/admin/tips.
import { prisma } from "@/lib/db";
import { aggregateTipsReport, type TipsReport } from "@/lib/tips-report";

export async function fetchTipsReport(tenantId: string, from: string, to: string): Promise<TipsReport> {
  const entries = await prisma.tipEntry.findMany({
    where: { tenantId, date: { gte: from, lte: to } },
    include: {
      distributions: {
        include: { employee: { select: { name: true } } },
        orderBy: { amount: "desc" },
      },
    },
    orderBy: { date: "asc" },
  });
  return aggregateTipsReport(entries);
}
