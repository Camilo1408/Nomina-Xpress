import type { PayrollResult } from "@/lib/payroll";
import type { BonusApplied } from "@/lib/bonuses";
import type { DiscountApplied } from "@/lib/discounts";

// Resultado de nómina/turnos enriquecido con propinas, bonos y descuentos,
// usado en reportes de pantalla, PDF y Excel.
export interface PayrollWithExtras extends PayrollResult {
  totalTips: number;
  netPayWithTips: number;
  bonuses: BonusApplied[];
  totalBonuses: number;
  discounts: DiscountApplied[];
  totalDiscounts: number;
  // Total final: neto + bonos − descuentos (nunca negativo; propinas son informativas)
  finalPay: number;
}
