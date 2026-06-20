import { prisma } from "@/lib/db";
import {
  BonusApplied,
  BonusAssignmentType,
  BonusFrequency,
  BonusMonthlyMode,
  BonusValueType,
  bonusAppliesToEmployee,
  computeBonusApplied,
  isFirstHalf,
} from "@/lib/bonuses";

interface EmployeeLike {
  id: string;
  payType: string;
}

export interface EmployeeBonuses {
  bonuses: BonusApplied[];
  totalBonuses: number;
}

/**
 * Resuelve los bonos activos aplicables a un conjunto de empleados para el
 * período [from, to] (una quincena). Devuelve un mapa employeeId -> EmployeeBonuses.
 *
 * Reglas aplicadas:
 *  - Solo bonos activos.
 *  - Solo se incluye un bono en el detalle si appliedAmount > 0 en esta quincena
 *    (p. ej. un bono mensual de segunda quincena no aparece en la primera).
 *  - STANDARD usa Bonus.amount; PER_EMPLOYEE usa BonusAssignment.amount.
 *  - SPECIFIC aplica solo a empleados con asignación activa.
 *  - No se duplica: el cálculo es determinista por quincena.
 */
export async function resolveBonusesForEmployees(
  tenantId: string,
  from: string,
  employees: EmployeeLike[]
): Promise<Map<string, EmployeeBonuses>> {
  const result = new Map<string, EmployeeBonuses>();
  for (const emp of employees) {
    result.set(emp.id, { bonuses: [], totalBonuses: 0 });
  }

  if (employees.length === 0) return result;

  const bonuses = await prisma.bonus.findMany({
    where: { tenantId, active: true },
    include: { assignments: { where: { active: true } } },
  });

  if (bonuses.length === 0) return result;

  const firstHalf = isFirstHalf(from);

  for (const emp of employees) {
    const applied: BonusApplied[] = [];
    let total = 0;

    for (const bonus of bonuses) {
      const assignmentType = bonus.assignmentType as BonusAssignmentType;
      const valueType = bonus.valueType as BonusValueType;
      const frequency = bonus.frequency as BonusFrequency;
      const monthlyMode = (bonus.monthlyMode ?? null) as BonusMonthlyMode | null;

      const assignment = bonus.assignments.find((a) => a.employeeId === emp.id);
      const hasAssignment = !!assignment;

      if (!bonusAppliesToEmployee(assignmentType, emp.payType, hasAssignment)) {
        continue;
      }

      // Valor configurado para este empleado
      let configuredAmount: number;
      if (valueType === "PER_EMPLOYEE") {
        // Requiere una asignación con monto; si no existe, el bono no aplica al empleado
        if (!assignment || assignment.amount == null) continue;
        configuredAmount = Number(assignment.amount);
      } else {
        configuredAmount = Number(bonus.amount);
      }

      if (configuredAmount <= 0) continue;

      const appliedAmount = computeBonusApplied(configuredAmount, frequency, monthlyMode, firstHalf);
      if (appliedAmount <= 0) continue;

      applied.push({
        bonusId: bonus.id,
        name: bonus.name,
        description: bonus.description ?? null,
        frequency,
        monthlyMode,
        valueType,
        configuredAmount: Math.round(configuredAmount),
        appliedAmount,
      });
      total += appliedAmount;
    }

    result.set(emp.id, { bonuses: applied, totalBonuses: Math.round(total) });
  }

  return result;
}
