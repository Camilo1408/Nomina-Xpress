// Lógica pura de bonos fijos. Sin acceso a base de datos — testeable de forma aislada.
// El cálculo es stateless: dado un bono y el período (quincena) del reporte,
// se determina cuánto se aplica. Esto evita duplicados y no altera históricos.

export type BonusValueType = "STANDARD" | "PER_EMPLOYEE";
export type BonusAssignmentType = "ALL" | "PAYROLL" | "SHIFT" | "SPECIFIC";
export type BonusFrequency = "BIWEEKLY" | "MONTHLY";
export type BonusMonthlyMode = "FIRST" | "SECOND" | "SPLIT";

export const BONUS_VALUE_TYPES: BonusValueType[] = ["STANDARD", "PER_EMPLOYEE"];
export const BONUS_ASSIGNMENT_TYPES: BonusAssignmentType[] = ["ALL", "PAYROLL", "SHIFT", "SPECIFIC"];
export const BONUS_FREQUENCIES: BonusFrequency[] = ["BIWEEKLY", "MONTHLY"];
export const BONUS_MONTHLY_MODES: BonusMonthlyMode[] = ["FIRST", "SECOND", "SPLIT"];

// Etiquetas legibles en español (reutilizadas en UI y reportes)
export const FREQUENCY_LABELS: Record<BonusFrequency, string> = {
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
};

export const MONTHLY_MODE_LABELS: Record<BonusMonthlyMode, string> = {
  FIRST: "Completo en primera quincena",
  SECOND: "Completo en segunda quincena",
  SPLIT: "Dividido en dos quincenas",
};

export const ASSIGNMENT_TYPE_LABELS: Record<BonusAssignmentType, string> = {
  ALL: "Todos los empleados",
  PAYROLL: "Solo nómina",
  SHIFT: "Solo turnos",
  SPECIFIC: "Empleados específicos",
};

// Detalle de un bono aplicado a un empleado en un período concreto
export interface BonusApplied {
  bonusId: string;
  name: string;
  description: string | null;
  frequency: BonusFrequency;
  monthlyMode: BonusMonthlyMode | null;
  valueType: BonusValueType;
  // Valor total configurado del bono para ese empleado (mensual o quincenal según frecuencia)
  configuredAmount: number;
  // Valor efectivamente aplicado en el período/quincena actual
  appliedAmount: number;
}

/**
 * Determina si un rango [from, to] corresponde a la primera quincena (días 1–15)
 * o a la segunda (16–fin de mes). Se decide por el día de la fecha `from`,
 * coincidiendo con el selector de período de la UI y con getPeriodForDate().
 */
export function isFirstHalf(fromDate: string): boolean {
  const day = Number(fromDate.split("-")[2]);
  return day <= 15;
}

/**
 * Calcula el monto aplicado de un bono en una quincena dada.
 * @param baseAmount valor configurado del bono para el empleado
 * @param frequency BIWEEKLY | MONTHLY
 * @param monthlyMode FIRST | SECOND | SPLIT (solo si MONTHLY)
 * @param firstHalf true si el período es la primera quincena del mes
 */
export function computeBonusApplied(
  baseAmount: number,
  frequency: BonusFrequency,
  monthlyMode: BonusMonthlyMode | null,
  firstHalf: boolean
): number {
  const base = Math.max(0, Math.round(baseAmount));
  if (base === 0) return 0;

  if (frequency === "BIWEEKLY") {
    // Valor completo en cada quincena
    return base;
  }

  // MONTHLY
  switch (monthlyMode) {
    case "FIRST":
      return firstHalf ? base : 0;
    case "SECOND":
      return firstHalf ? 0 : base;
    case "SPLIT": {
      // Mitad en cada quincena. El redondeo va a la primera quincena para
      // garantizar firstHalf + secondHalf === base (sin perder pesos).
      const first = Math.round(base / 2);
      return firstHalf ? first : base - first;
    }
    default:
      // MONTHLY sin modo definido: se trata como completo en primera quincena
      return firstHalf ? base : 0;
  }
}

/**
 * Indica si un bono aplica a un empleado según el tipo de asignación.
 * Para SPECIFIC se delega en `hasAssignment` (membresía por fila de asignación).
 */
export function bonusAppliesToEmployee(
  assignmentType: BonusAssignmentType,
  employeePayType: string,
  hasAssignment: boolean
): boolean {
  switch (assignmentType) {
    case "ALL":
      return true;
    case "PAYROLL":
      return employeePayType === "PAYROLL";
    case "SHIFT":
      return employeePayType === "SHIFT";
    case "SPECIFIC":
      return hasAssignment;
    default:
      return false;
  }
}
