import { TIP_CONTEST_MAX_PERCENT } from "@/lib/contests";

export const MENAJE_PERCENT = 0.1;

export interface TipEmployeeInput {
  id: string;
  name: string;
  hoursWorked: number;
  tipPercent: number;
}

/** Porcentaje que un ítem de concurso descuenta del bruto de propinas de un día. */
export interface ContestDeduction {
  contestId: string;
  contestItemId: string;
  percent: number;
}

/** Dinero efectivamente reservado para un ítem en un día concreto. */
export interface ContestReserveResult extends ContestDeduction {
  amount: number;
}

export interface TipDistributionResult {
  employeeId: string;
  employeeName: string;
  hoursWorked: number;
  tipPercent: number;
  effectiveHours: number;
  amount: number;
}

export interface TipCalculation {
  totalAmount: number;
  menaje: number;
  netAmount: number;
  ratePerHour: number;
  distributions: TipDistributionResult[];
  /** Suma de las reservas de concurso. 0 cuando no hay concursos activos ese día. */
  contestReserved: number;
  /** Desglose por ítem, para persistir cada reserva por separado. */
  contestReserves: ContestReserveResult[];
}

/**
 * Reparte las propinas brutas de UN día.
 *
 * Invariante que este cálculo garantiza siempre, al peso:
 *
 *     totalAmount = menaje + Σ(contestReserves) + netAmount
 *
 * Cada reserva se redondea de forma independiente y `netAmount` se obtiene por
 * RESTA, nunca aplicando un porcentaje. Así la suma de las partes es exacta pase
 * lo que pase con el redondeo: no se pierde ni se inventa un peso.
 *
 * @param deductions Porcentajes de concursos activos ese día. Con la lista vacía
 *   —el valor por defecto— el resultado es idéntico al del sistema antes de que
 *   existiera el módulo de concursos.
 */
export function calculateTips(
  totalAmount: number,
  employees: TipEmployeeInput[],
  deductions: ContestDeduction[] = []
): TipCalculation {
  const menaje = Math.round(totalAmount * MENAJE_PERCENT);

  const seen = new Set<string>();
  let totalPercent = 0;
  for (const d of deductions) {
    if (!Number.isFinite(d.percent) || d.percent < 0) {
      throw new Error(
        `Porcentaje inválido para el ítem ${d.contestItemId}: ${d.percent}`
      );
    }
    if (seen.has(d.contestItemId)) {
      throw new Error(`Ítem de concurso duplicado en el cálculo: ${d.contestItemId}`);
    }
    seen.add(d.contestItemId);
    totalPercent += d.percent;
  }

  // Guarda dura, además de la validación que ya hacen las rutas al activar un
  // concurso. Nunca debe llegarse aquí con un exceso, pero si pasara es mejor
  // fallar que descontar de más a los empleados.
  if (Math.round(totalPercent * 100) / 100 > TIP_CONTEST_MAX_PERCENT) {
    throw new Error(
      `Las reservas de concurso suman ${totalPercent}%, por encima del tope del ${TIP_CONTEST_MAX_PERCENT}%`
    );
  }

  const contestReserves: ContestReserveResult[] = deductions.map((d) => ({
    ...d,
    amount: Math.round(totalAmount * (d.percent / 100)),
  }));
  const contestReserved = contestReserves.reduce((s, r) => s + r.amount, 0);

  const netAmount = totalAmount - menaje - contestReserved;
  if (netAmount < 0) {
    throw new Error(
      `El descuento total (menaje ${menaje} + concursos ${contestReserved}) supera las propinas del día (${totalAmount})`
    );
  }

  const withEffective = employees.map((e) => ({
    ...e,
    effectiveHours: e.hoursWorked * (e.tipPercent / 100),
  }));

  const totalEffective = withEffective.reduce((s, e) => s + e.effectiveHours, 0);
  const ratePerHour = totalEffective > 0 ? netAmount / totalEffective : 0;

  const distributions: TipDistributionResult[] = withEffective.map((e) => ({
    employeeId: e.id,
    employeeName: e.name,
    hoursWorked: e.hoursWorked,
    tipPercent: e.tipPercent,
    effectiveHours: Math.round(e.effectiveHours * 100) / 100,
    amount: Math.round(e.effectiveHours * ratePerHour),
  }));

  return {
    totalAmount,
    menaje,
    netAmount,
    ratePerHour: Math.round(ratePerHour),
    distributions,
    contestReserved,
    contestReserves,
  };
}

export function getPeriodForDate(dateStr: string): { periodStart: string; periodEnd: string } {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (day <= 15) {
    const lastDay = 15;
    return {
      periodStart: `${year}-${String(month).padStart(2, "0")}-01`,
      periodEnd: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  const lastDay = new Date(year, month, 0).getDate();
  return {
    periodStart: `${year}-${String(month).padStart(2, "0")}-16`,
    periodEnd: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}
