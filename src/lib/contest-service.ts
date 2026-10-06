// Acceso a datos del módulo de concursos. La lógica pura vive en contests.ts.
//
// Pieza central: resolveContestDeductionsForDate(), el ÚNICO sitio que decide
// qué porcentajes descuenta un día. Los tres puntos que escriben propinas
// (POST /tips, PUT /tips/[id] y recalculateTipForDate) pasan por aquí, así que
// el recálculo que ya disparan los festivos y el registro de horas arrastra las
// reservas correctamente sin código adicional.

import { prisma } from "@/lib/db";
import {
  eachDateInRange,
  validateTotalContestPercent,
  type ContestStatus,
} from "@/lib/contests";
import type { ContestDeduction } from "@/lib/tips";

// ─── Resolución de deducciones de un día ─────────────────────────────────────

/**
 * Porcentajes que descuentan las propinas de `date`.
 *
 * Devuelve dos clases de deducción:
 *
 * 1. **Congeladas** — reservas que ya existen para ese día y cuyo concurso está
 *    FINALIZADO o PAGADO. Se devuelven con `fixedAmount`, de modo que un
 *    recálculo posterior (una corrección de horas, un festivo nuevo) no pueda
 *    mover un dinero que ya respalda un bono adjudicado.
 *
 * 2. **Vivas** — ítems pendientes de concursos ACTIVO cuyo rango cubre el día.
 *    Estas sí se recalculan sobre el total vigente.
 *
 * Todo lo demás (BORRADOR, PROGRAMADO, CANCELADO, ítems DESIERTOS) no descuenta
 * nada. Si existía una reserva suya, quedará fuera del resultado y el
 * persistidor la marcará DEVUELTA: así la devolución por cancelación o por ítem
 * desierto no necesita un camino de código propio.
 */
export async function resolveContestDeductionsForDate(
  tenantId: string,
  date: string
): Promise<ContestDeduction[]> {
  const [frozen, live] = await Promise.all([
    prisma.contestTipReserve.findMany({
      where: {
        tenantId,
        date,
        status: "RESERVADA",
        contestItem: {
          outcome: { not: "DESIERTO" },
          contest: { status: { in: ["FINALIZADO", "PAGADO"] } },
        },
      },
      select: { contestId: true, contestItemId: true, percent: true, amount: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.contestItem.findMany({
      where: {
        tenantId,
        outcome: "PENDIENTE",
        contest: {
          status: "ACTIVO",
          startDate: { lte: date },
          endDate: { gte: date },
        },
      },
      select: { id: true, contestId: true, percent: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const frozenIds = new Set(frozen.map((f) => f.contestItemId));

  return [
    ...frozen.map((f) => ({
      contestId: f.contestId,
      contestItemId: f.contestItemId,
      percent: f.percent,
      fixedAmount: f.amount,
    })),
    ...live
      .filter((i) => !frozenIds.has(i.id))
      .map((i) => ({ contestId: i.contestId, contestItemId: i.id, percent: i.percent })),
  ];
}

// ─── Validación de porcentajes día a día ─────────────────────────────────────

export interface PercentConflict {
  date: string;
  total: number;
}

export type ContestPercentValidation =
  | { ok: true }
  | { ok: false; error: string; conflicts: PercentConflict[] };

/**
 * Verifica que, para CADA día del rango propuesto, el porcentaje acumulado de
 * todos los concursos no supere el tope.
 *
 * Cuentan los concursos ACTIVO y PROGRAMADO: los programados van a activarse, y
 * dejar que se acumulen por encima del tope solo trasladaría el fallo al momento
 * de activar, cuando ya es más caro de corregir.
 */
export async function validateContestPercentages(params: {
  tenantId: string;
  startDate: string;
  endDate: string;
  percents: number[];
  /** Concurso a excluir del conteo, al editar uno existente. */
  excludeContestId?: string;
}): Promise<ContestPercentValidation> {
  const { tenantId, startDate, endDate, percents, excludeContestId } = params;
  const proposed = percents.reduce((s, p) => s + p, 0);

  const others = await prisma.contest.findMany({
    where: {
      tenantId,
      status: { in: ["ACTIVO", "PROGRAMADO"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      ...(excludeContestId ? { id: { not: excludeContestId } } : {}),
    },
    select: {
      startDate: true,
      endDate: true,
      items: { where: { outcome: "PENDIENTE" }, select: { percent: true } },
    },
  });

  const conflicts: PercentConflict[] = [];
  for (const date of eachDateInRange(startDate, endDate)) {
    let total = proposed;
    for (const c of others) {
      if (date >= c.startDate && date <= c.endDate) {
        total += c.items.reduce((s, i) => s + i.percent, 0);
      }
    }
    const check = validateTotalContestPercent(total);
    if (!check.ok) conflicts.push({ date, total: Math.round(total * 100) / 100 });
  }

  if (conflicts.length === 0) return { ok: true };

  const peor = conflicts.reduce((a, b) => (b.total > a.total ? b : a));
  return {
    ok: false,
    error:
      `El tope de descuento se supera en ${conflicts.length} día(s). ` +
      `El peor caso es el ${peor.date}, donde los concursos sumarían ${peor.total}%.`,
    conflicts,
  };
}

// ─── Recálculo de las propinas afectadas por un concurso ─────────────────────

/**
 * Recalcula las propinas de todos los días del rango que tengan registro.
 *
 * Es el motor de tres operaciones distintas, que solo se diferencian en el
 * cambio de estado que se hace ANTES de llamarla:
 *   - activar un concurso  → crea sus reservas sobre los días ya registrados
 *   - cancelarlo           → sus reservas dejan de aplicar y se devuelven
 *   - declarar un ítem desierto → ídem, acotado a ese ítem
 *
 * Devuelve el detalle de lo que cambió, para auditoría y para la respuesta al
 * usuario.
 */
export async function recalculateTipsForRange(
  tenantId: string,
  startDate: string,
  endDate: string,
  reason: string
): Promise<{ date: string; netBefore: number; netAfter: number; delta: number }[]> {
  // Import diferido: recalculate-tips importa este módulo para resolver las
  // deducciones, así que cargarlo arriba crearía un ciclo en tiempo de módulo.
  const { recalculateTipForDate } = await import("@/lib/recalculate-tips");

  const entries = await prisma.tipEntry.findMany({
    where: { tenantId, date: { gte: startDate, lte: endDate } },
    select: { date: true, netAmount: true },
    orderBy: { date: "asc" },
  });

  const changes: { date: string; netBefore: number; netAfter: number; delta: number }[] = [];

  for (const entry of entries) {
    await recalculateTipForDate(tenantId, entry.date, reason);
    const after = await prisma.tipEntry.findUnique({
      where: { tenantId_date: { tenantId, date: entry.date } },
      select: { netAmount: true },
    });
    const netAfter = after?.netAmount ?? entry.netAmount;
    if (netAfter !== entry.netAmount) {
      changes.push({
        date: entry.date,
        netBefore: entry.netAmount,
        netAfter,
        delta: netAfter - entry.netAmount,
      });
    }
  }

  return changes;
}

// ─── Previsualización del impacto ────────────────────────────────────────────

export interface ImpactRow {
  date: string;
  totalAmount: number;
  netBefore: number;
  netAfter: number;
  delta: number;
}

export interface ImpactPreview {
  rows: ImpactRow[];
  totalDelta: number;
  affectedDays: number;
  /** Días del rango sin registro de propinas: no se ven afectados. */
  daysWithoutTips: number;
  error?: string;
}

/**
 * Calcula, SIN ESCRIBIR NADA, cómo quedarían las propinas si el concurso pasara
 * al estado simulado. Es lo que alimenta el diálogo de confirmación antes de
 * activar, cancelar o cambiar porcentajes y fechas.
 */
export async function computeImpactPreview(params: {
  tenantId: string;
  contestId: string;
  simulated: {
    status: ContestStatus;
    startDate: string;
    endDate: string;
    items: { id: string; percent: number }[];
  };
}): Promise<ImpactPreview> {
  const { calculateTips } = await import("@/lib/tips");
  const { collectEmployeeHoursForDate } = await import("@/lib/recalculate-tips");
  const { tenantId, contestId, simulated } = params;

  // Días a examinar: los del rango simulado más aquellos donde el concurso ya
  // tiene reservas (para detectar los que SALEN del rango al acortarlo).
  const reserved = await prisma.contestTipReserve.findMany({
    where: { tenantId, contestId, status: "RESERVADA" },
    select: { date: true },
  });
  const dates = [
    ...new Set([...eachDateInRange(simulated.startDate, simulated.endDate), ...reserved.map((r) => r.date)]),
  ].sort();

  const entries = await prisma.tipEntry.findMany({
    where: { tenantId, date: { in: dates } },
    select: { id: true, date: true, totalAmount: true, netAmount: true },
    orderBy: { date: "asc" },
  });
  const byDate = new Map(entries.map((e) => [e.date, e]));

  const rows: ImpactRow[] = [];
  for (const date of dates) {
    const entry = byDate.get(date);
    if (!entry) continue;

    // Deducciones actuales sin este concurso, más las del estado simulado.
    const current = (await resolveContestDeductionsForDate(tenantId, date)).filter(
      (d) => d.contestId !== contestId
    );
    const simulatedDeductions =
      simulated.status === "ACTIVO" && date >= simulated.startDate && date <= simulated.endDate
        ? simulated.items.map((i) => ({
            contestId,
            contestItemId: i.id,
            percent: i.percent,
          }))
        : [];

    const employees = await collectEmployeeHoursForDate(tenantId, date);

    try {
      const calc = calculateTips(entry.totalAmount, employees, [
        ...current,
        ...simulatedDeductions,
      ]);
      if (calc.netAmount !== entry.netAmount) {
        rows.push({
          date,
          totalAmount: entry.totalAmount,
          netBefore: entry.netAmount,
          netAfter: calc.netAmount,
          delta: calc.netAmount - entry.netAmount,
        });
      }
    } catch (err) {
      return {
        rows,
        totalDelta: rows.reduce((s, r) => s + r.delta, 0),
        affectedDays: rows.length,
        daysWithoutTips: dates.length - entries.length,
        error: `No se puede aplicar en el ${date}: ${(err as Error).message}`,
      };
    }
  }

  return {
    rows,
    totalDelta: rows.reduce((s, r) => s + r.delta, 0),
    affectedDays: rows.length,
    daysWithoutTips: dates.length - entries.length,
  };
}

// ─── Base de propinas y reserva acumulada de un ítem ─────────────────────────

export interface ItemReserveSummary {
  contestItemId: string;
  /** Σ del bruto de propinas de los días con reserva: la base del premio. */
  tipBase: number;
  /** Σ del dinero efectivamente reservado. Es la cifra válida del premio. */
  reservedAmount: number;
  days: number;
}

/**
 * Resume lo reservado por cada ítem de un concurso.
 *
 * `reservedAmount` es la suma de las reservas DIARIAS, no un porcentaje del
 * total del período. Es una diferencia deliberada: por el redondeo diario ambas
 * cifras pueden separarse en unos pocos pesos, y la válida es esta, porque es la
 * que efectivamente se descontó a los empleados.
 */
export async function summarizeItemReserves(
  tenantId: string,
  contestId: string
): Promise<Map<string, ItemReserveSummary>> {
  const reserves = await prisma.contestTipReserve.findMany({
    where: { tenantId, contestId, status: "RESERVADA" },
    select: { contestItemId: true, tipTotalAmount: true, amount: true },
  });

  const map = new Map<string, ItemReserveSummary>();
  for (const r of reserves) {
    const acc =
      map.get(r.contestItemId) ??
      { contestItemId: r.contestItemId, tipBase: 0, reservedAmount: 0, days: 0 };
    acc.tipBase += r.tipTotalAmount;
    acc.reservedAmount += r.amount;
    acc.days += 1;
    map.set(r.contestItemId, acc);
  }
  return map;
}
