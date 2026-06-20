export const MENAJE_PERCENT = 0.1;

export interface TipEmployeeInput {
  id: string;
  name: string;
  hoursWorked: number;
  tipPercent: number;
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
}

export function calculateTips(
  totalAmount: number,
  employees: TipEmployeeInput[]
): TipCalculation {
  const menaje = Math.round(totalAmount * MENAJE_PERCENT);
  const netAmount = totalAmount - menaje;

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
