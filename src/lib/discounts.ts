// Descuentos fijos/personalizados. Restan del pago final.
// La matemática de aplicación por quincena es idéntica a la de bonos, así que
// se reutilizan las funciones puras genéricas de "@/lib/bonuses".

import type {
  BonusFrequency,
  BonusMonthlyMode,
  BonusValueType,
} from "@/lib/bonuses";

// Reexportamos las etiquetas y constantes (son genéricas) para uso en UI/reportes
export {
  FREQUENCY_LABELS,
  MONTHLY_MODE_LABELS,
  ASSIGNMENT_TYPE_LABELS,
  BONUS_VALUE_TYPES as DISCOUNT_VALUE_TYPES,
  BONUS_ASSIGNMENT_TYPES as DISCOUNT_ASSIGNMENT_TYPES,
  BONUS_FREQUENCIES as DISCOUNT_FREQUENCIES,
  BONUS_MONTHLY_MODES as DISCOUNT_MONTHLY_MODES,
  computeBonusApplied as computeDiscountApplied,
  bonusAppliesToEmployee as discountAppliesToEmployee,
  isFirstHalf,
  biweeklyPeriodsInRange,
} from "@/lib/bonuses";

export type DiscountValueType = BonusValueType;
export type DiscountAssignmentType = import("@/lib/bonuses").BonusAssignmentType;
export type DiscountFrequency = BonusFrequency;
export type DiscountMonthlyMode = BonusMonthlyMode;

// Detalle de un descuento aplicado a un empleado en un período concreto
export interface DiscountApplied {
  discountId: string;
  name: string;
  description: string | null;
  frequency: DiscountFrequency;
  monthlyMode: DiscountMonthlyMode | null;
  valueType: DiscountValueType;
  // Valor total configurado del descuento para ese empleado
  configuredAmount: number;
  // Valor efectivamente descontado en el rango consultado (suma de las quincenas
  // que abarque; en un reporte quincenal normal es el valor de esa quincena).
  appliedAmount: number;
  // Cuántas quincenas del rango aportaron valor (1 en un reporte quincenal normal).
  periodsCount: number;
}

/**
 * Total final a pagar = neto + propinas + bonos − descuentos.
 * Nunca queda negativo: si los descuentos superan el resto, se deja en 0.
 */
export function clampFinalPay(
  netBase: number,
  totalBonuses: number,
  totalDiscounts: number
): number {
  return Math.max(0, Math.round(netBase + totalBonuses - totalDiscounts));
}
