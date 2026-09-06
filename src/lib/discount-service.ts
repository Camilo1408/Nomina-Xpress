import { prisma } from "@/lib/db";
import {
  DiscountApplied,
  DiscountAssignmentType,
  DiscountFrequency,
  DiscountMonthlyMode,
  DiscountValueType,
  discountAppliesToEmployee,
  computeDiscountApplied,
  biweeklyPeriodsInRange,
} from "@/lib/discounts";

interface EmployeeLike {
  id: string;
  payType: string;
}

export interface EmployeeDiscounts {
  discounts: DiscountApplied[];
  totalDiscounts: number;
}

/**
 * Resuelve los descuentos activos aplicables a un conjunto de empleados para el
 * período [from, to]. Devuelve un mapa employeeId -> EmployeeDiscounts.
 *
 * Mismas reglas que los bonos: solo activos, solo si appliedAmount > 0,
 * STANDARD usa Discount.amount, PER_EMPLOYEE usa DiscountAssignment.amount,
 * SPECIFIC solo a empleados asignados. El rango se descompone en las quincenas
 * que abarca y el descuento se aplica una vez por quincena.
 */
export async function resolveDiscountsForEmployees(
  tenantId: string,
  from: string,
  to: string,
  employees: EmployeeLike[]
): Promise<Map<string, EmployeeDiscounts>> {
  const result = new Map<string, EmployeeDiscounts>();
  for (const emp of employees) {
    result.set(emp.id, { discounts: [], totalDiscounts: 0 });
  }

  if (employees.length === 0) return result;

  const discounts = await prisma.discount.findMany({
    where: { tenantId, active: true },
    include: { assignments: { where: { active: true } } },
  });

  if (discounts.length === 0) return result;

  const periods = biweeklyPeriodsInRange(from, to);

  for (const emp of employees) {
    const applied: DiscountApplied[] = [];
    let total = 0;

    for (const discount of discounts) {
      const assignmentType = discount.assignmentType as DiscountAssignmentType;
      const valueType = discount.valueType as DiscountValueType;
      const frequency = discount.frequency as DiscountFrequency;
      const monthlyMode = (discount.monthlyMode ?? null) as DiscountMonthlyMode | null;

      const assignment = discount.assignments.find((a) => a.employeeId === emp.id);
      const hasAssignment = !!assignment;

      if (!discountAppliesToEmployee(assignmentType, emp.payType, hasAssignment)) {
        continue;
      }

      let configuredAmount: number;
      if (valueType === "PER_EMPLOYEE") {
        if (!assignment || assignment.amount == null) continue;
        configuredAmount = Number(assignment.amount);
      } else {
        configuredAmount = Number(discount.amount);
      }

      if (configuredAmount <= 0) continue;

      // Una aplicación por cada quincena que abarque el rango consultado.
      let appliedAmount = 0;
      let periodsCount = 0;
      for (const period of periods) {
        const perPeriod = computeDiscountApplied(configuredAmount, frequency, monthlyMode, period.firstHalf);
        if (perPeriod <= 0) continue;
        appliedAmount += perPeriod;
        periodsCount += 1;
      }
      if (appliedAmount <= 0) continue;

      applied.push({
        discountId: discount.id,
        name: discount.name,
        description: discount.description ?? null,
        frequency,
        monthlyMode,
        valueType,
        configuredAmount: Math.round(configuredAmount),
        appliedAmount,
        periodsCount,
      });
      total += appliedAmount;
    }

    result.set(emp.id, { discounts: applied, totalDiscounts: Math.round(total) });
  }

  return result;
}
