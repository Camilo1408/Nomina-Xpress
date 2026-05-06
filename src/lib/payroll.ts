import type { Employee, TimeEntry, PayAdjustment } from "@/generated/prisma";

export interface PayrollResult {
  employeeId: string;
  employeeName: string;
  normalHours: number;
  specialHours: number;
  hourlyRateNormal: number;
  hourlyRateSpecial: number;
  grossPay: number;
  adjustments: { id: string; type: string; amount: number; description: string }[];
  totalAdjustments: number;
  netPay: number;
  entries: TimeEntry[];
}

export function calculateHours(checkIn: Date, checkOut: Date): number {
  return Math.max(0, (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60));
}

export function calculatePayroll(
  employee: Employee,
  entries: TimeEntry[],
  adjustments: PayAdjustment[]
): PayrollResult {
  let normalHours = 0;
  let specialHours = 0;

  for (const entry of entries) {
    // Primer turno
    if (entry.checkOut) {
      const hours = calculateHours(entry.checkIn, entry.checkOut);
      if (entry.isSpecial) specialHours += hours;
      else normalHours += hours;
    }
    // Segundo turno (turno partido)
    if (entry.checkIn2 && entry.checkOut2) {
      const hours2 = calculateHours(entry.checkIn2, entry.checkOut2);
      if (entry.isSpecial) specialHours += hours2;
      else normalHours += hours2;
    }
  }

  const rateNormal = Number(employee.hourlyRateNormal);
  const rateSpecial = Number(employee.hourlyRateSpecial);
  const grossPay = normalHours * rateNormal + specialHours * rateSpecial;

  const adjustmentDetails = adjustments.map((a) => ({
    id: a.id,
    type: a.type,
    amount: Number(a.amount),
    description: a.description,
  }));

  const totalAdjustments = adjustmentDetails.reduce(
    (sum, a) => (a.type === "BONUS" ? sum + a.amount : sum - a.amount),
    0
  );

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    normalHours: Math.round(normalHours * 100) / 100,
    specialHours: Math.round(specialHours * 100) / 100,
    hourlyRateNormal: rateNormal,
    hourlyRateSpecial: rateSpecial,
    grossPay: Math.round(grossPay),
    adjustments: adjustmentDetails,
    totalAdjustments: Math.round(totalAdjustments),
    netPay: Math.round(grossPay + totalAdjustments),
    entries,
  };
}
