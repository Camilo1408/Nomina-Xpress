// Carga en bloque de los datos por empleado que alimentan un reporte de nómina
// para el período [from, to]. Reemplaza el patrón N+1 (3 queries por empleado)
// por 3 queries masivas + agrupación en memoria por employeeId.
//
// IMPORTANTE: este helper SOLO obtiene y agrupa datos; NO calcula nada. Cada
// ruta conserva su propio ensamblado (calculatePayroll, propinas, bonos,
// descuentos, finalPay) sin cambios, para no alterar ningún resultado.
//
// Equivalencia de orden: las queries masivas no llevan `orderBy`, igual que las
// per-empleado originales. SQLite/libSQL devuelve filas en orden de rowid; al
// filtrar ese orden global por empleado se conserva el mismo orden relativo que
// una query per-empleado, de modo que los arrays quedan idénticos.

import { prisma } from "@/lib/db";
import type { TimeEntry, PayAdjustment } from "@/generated/prisma";

export type TipDistributionWithDate = {
  id: string;
  tenantId: string;
  tipEntryId: string;
  employeeId: string;
  hoursWorked: number;
  tipPercent: number;
  effectiveHours: number;
  amount: number;
  createdAt: Date;
  tipEntry: { date: string };
};

export interface EmployeePeriodData {
  entries: TimeEntry[];
  adjustments: PayAdjustment[];
  tipDists: TipDistributionWithDate[];
}

function emptyBucket(): EmployeePeriodData {
  return { entries: [], adjustments: [], tipDists: [] };
}

/**
 * Devuelve un mapa employeeId -> { entries, adjustments, tipDists } con todos los
 * datos del período para los empleados indicados. Cada empleado del arreglo
 * recibido queda presente en el mapa (con buckets vacíos si no tiene datos).
 */
export async function fetchPayrollPeriodData(
  tenantId: string,
  from: string,
  to: string,
  employeeIds: string[]
): Promise<Map<string, EmployeePeriodData>> {
  const map = new Map<string, EmployeePeriodData>();
  for (const id of employeeIds) map.set(id, emptyBucket());

  if (employeeIds.length === 0) return map;

  const [entries, adjustments, tipDists] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { tenantId, employeeId: { in: employeeIds }, date: { gte: from, lte: to } },
    }),
    prisma.payAdjustment.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        periodStart: { gte: from },
        periodEnd: { lte: to },
      },
    }),
    prisma.tipDistribution.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        tipEntry: { date: { gte: from, lte: to } },
      },
      include: { tipEntry: { select: { date: true } } },
    }),
  ]);

  for (const e of entries) map.get(e.employeeId)?.entries.push(e);
  for (const a of adjustments) map.get(a.employeeId)?.adjustments.push(a);
  for (const t of tipDists) map.get(t.employeeId)?.tipDists.push(t as TipDistributionWithDate);

  return map;
}
