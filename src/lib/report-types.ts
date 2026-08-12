import type { PayrollResult } from "@/lib/payroll";
import type { BonusApplied } from "@/lib/bonuses";
import type { DiscountApplied } from "@/lib/discounts";

/** Cuota de un bono de concurso que aparece en la quincena del reporte. */
export interface ContestBonusApplied {
  paymentId: string;
  contestName: string;
  itemName: string;
  /** Meta y resultado congelados al adjudicar, para justificar el bono. */
  goal: string;
  resultValue: number;
  installment: number;
  /** Cuántas cuotas tiene el bono en total (1 en pago único, 2 en dividido). */
  totalInstallments: number;
  amount: number;
  /** Valor total del bono, del que esta cuota es una parte. */
  bonusTotal: number;
  /** PENDIENTE | PAGADO */
  status: string;
}

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
  // Bonos de concurso de la quincena. Igual que las propinas: INFORMATIVOS.
  // No entran en finalPay bajo ninguna circunstancia.
  contestBonuses: ContestBonusApplied[];
  totalContestBonus: number;
  // Lo que el empleado recibe en total contando propinas y bonos de concurso.
  // Es un dato de lectura: el pago de nómina sigue siendo finalPay.
  totalInformativeReceived: number;
}
