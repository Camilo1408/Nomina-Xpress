export type Role = "ADMIN" | "EMPLOYEE";
export type AdjustmentType = "DISCOUNT" | "BONUS";
export type PeriodType = "first" | "second" | "month" | "custom";

export interface PayrollReportEmployee {
  employeeId: string;
  employeeName: string;
  normalHours: number;
  specialHours: number;
  hourlyRateNormal: number;
  hourlyRateSpecial: number;
  grossPay: number;
  adjustments: { type: string; amount: number; description: string }[];
  totalAdjustments: number;
  netPay: number;
}

export interface PayrollReport {
  period: { from: string; to: string };
  employees: PayrollReportEmployee[];
}
