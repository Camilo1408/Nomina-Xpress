// Lógica pura del módulo de concursos e incentivos. Sin acceso a base de datos:
// todo aquí es determinista y testeable de forma aislada.
//
// El acceso a datos vive en contest-service.ts y contest-bonus-service.ts.
//
// Diseño: docs/superpowers/specs/2026-08-12-concursos-incentivos-design.md

import { getBiweeklyPeriodForDate } from "@/lib/utils";

// ─── Estados y enumeraciones ─────────────────────────────────────────────────

export const CONTEST_STATUSES = [
  "BORRADOR",
  "PROGRAMADO",
  "ACTIVO",
  "FINALIZADO",
  "PAGADO",
  "CANCELADO",
] as const;
export type ContestStatus = (typeof CONTEST_STATUSES)[number];

export const CONTEST_CRITERIA = [
  "MAYOR_VALOR",
  "MENOR_VALOR",
  "PRIMERO_EN_ALCANZAR",
  "SELECCION_MANUAL",
] as const;
export type ContestCriteria = (typeof CONTEST_CRITERIA)[number];

export const WINNER_MODES = ["GANADOR_UNICO", "REPARTIDO"] as const;
export type WinnerMode = (typeof WINNER_MODES)[number];

export const PAYOUT_MODES = ["UNICO", "DIVIDIDO"] as const;
export type PayoutMode = (typeof PAYOUT_MODES)[number];

export const CONTEST_ITEM_OUTCOMES = ["PENDIENTE", "ADJUDICADO", "DESIERTO"] as const;
export type ContestItemOutcome = (typeof CONTEST_ITEM_OUTCOMES)[number];

export const CONTEST_BONUS_STATUSES = ["PENDIENTE", "PARCIAL", "PAGADO", "ANULADO"] as const;
export type ContestBonusStatus = (typeof CONTEST_BONUS_STATUSES)[number];

export const CONTEST_PAYMENT_STATUSES = ["PENDIENTE", "PAGADO", "ANULADO"] as const;
export type ContestPaymentStatus = (typeof CONTEST_PAYMENT_STATUSES)[number];

export const CONTEST_RESERVE_STATUSES = ["RESERVADA", "DEVUELTA"] as const;
export type ContestReserveStatus = (typeof CONTEST_RESERVE_STATUSES)[number];

// ─── Etiquetas legibles (reutilizadas en UI, reportes y auditoría) ───────────

export const CONTEST_STATUS_LABELS: Record<ContestStatus, string> = {
  BORRADOR: "Borrador",
  PROGRAMADO: "Programado",
  ACTIVO: "Activo",
  FINALIZADO: "Finalizado",
  PAGADO: "Pagado",
  CANCELADO: "Cancelado",
};

export const CONTEST_CRITERIA_LABELS: Record<ContestCriteria, string> = {
  MAYOR_VALOR: "Mayor resultado",
  MENOR_VALOR: "Menor resultado",
  PRIMERO_EN_ALCANZAR: "Primero en alcanzar la meta",
  SELECCION_MANUAL: "Selección manual",
};

export const WINNER_MODE_LABELS: Record<WinnerMode, string> = {
  GANADOR_UNICO: "Un solo ganador",
  REPARTIDO: "Repartido entre todos los que cumplan",
};

export const PAYOUT_MODE_LABELS: Record<PayoutMode, string> = {
  UNICO: "Pago único en la siguiente quincena",
  DIVIDIDO: "Dividido en las dos quincenas siguientes",
};

export const CONTEST_ITEM_OUTCOME_LABELS: Record<ContestItemOutcome, string> = {
  PENDIENTE: "Pendiente",
  ADJUDICADO: "Adjudicado",
  DESIERTO: "Desierto",
};

export const CONTEST_BONUS_STATUS_LABELS: Record<ContestBonusStatus, string> = {
  PENDIENTE: "Pendiente",
  PARCIAL: "Pago parcial",
  PAGADO: "Pagado",
  ANULADO: "Anulado",
};

// ─── Topes de descuento sobre las propinas ───────────────────────────────────
// El menaje es una constante histórica del sistema (MENAJE_PERCENT = 0.1 en
// tips.ts). Aquí se expresa en puntos porcentuales para poder sumarlo con los
// porcentajes de concursos, que también van en puntos.

export const TIP_MENAJE_PERCENT = 10;
export const TIP_CONTEST_MAX_PERCENT = 20;
export const TIP_DEDUCTION_MAX_PERCENT = TIP_MENAJE_PERCENT + TIP_CONTEST_MAX_PERCENT;

/** Redondea a 2 decimales para que sumar porcentajes no arrastre error de punto flotante. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Aplicabilidad de un concurso a un día concreto ──────────────────────────

/**
 * Un ítem reserva dinero de las propinas de un día si y solo si su concurso está
 * ACTIVO y la fecha cae dentro del rango (extremos incluidos).
 *
 * Ni PROGRAMADO ni FINALIZADO reservan: el primero porque aún no ha empezado a
 * regir, el segundo porque su reserva ya quedó congelada. Esto evita necesitar un
 * cron y hace que nada cambie sin una acción explícita de un usuario.
 *
 * Las fechas se comparan como texto "YYYY-MM-DD", igual que en el resto del
 * sistema: sin objetos Date, sin zonas horarias.
 */
export function contestAppliesToDate(
  status: ContestStatus,
  startDate: string,
  endDate: string,
  date: string
): boolean {
  if (status !== "ACTIVO") return false;
  return date >= startDate && date <= endDate;
}

// ─── Transiciones de estado ──────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<ContestStatus, ContestStatus[]> = {
  BORRADOR: ["PROGRAMADO", "CANCELADO"],
  PROGRAMADO: ["ACTIVO", "CANCELADO"],
  ACTIVO: ["FINALIZADO", "CANCELADO"],
  FINALIZADO: ["PAGADO", "CANCELADO"],
  PAGADO: [],
  CANCELADO: [],
};

export function canTransition(from: ContestStatus, to: ContestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Si se puede editar la CONFIGURACIÓN del concurso: fechas, porcentajes, ítems y
 * modalidad de pago. En FINALIZADO todavía se registran resultados, se adjudican
 * ganadores y se pagan cuotas — esas acciones no tocan las reservas congeladas.
 */
export function isContestConfigEditable(status: ContestStatus): boolean {
  return status === "BORRADOR" || status === "PROGRAMADO" || status === "ACTIVO";
}

// ─── Validación de porcentajes ───────────────────────────────────────────────

export type PercentValidation = { ok: true } | { ok: false; error: string };

/** Valida el porcentaje de UN ítem, aislado del resto. */
export function validateItemPercent(percent: number): PercentValidation {
  if (!Number.isFinite(percent)) {
    return { ok: false, error: "El porcentaje debe ser un número válido" };
  }
  if (percent <= 0) {
    return { ok: false, error: "El porcentaje debe ser mayor que 0" };
  }
  if (percent > TIP_CONTEST_MAX_PERCENT) {
    return {
      ok: false,
      error: `El porcentaje de un ítem no puede superar el ${TIP_CONTEST_MAX_PERCENT}%`,
    };
  }
  if (round2(percent) !== percent) {
    return { ok: false, error: "El porcentaje admite como máximo 2 decimales" };
  }
  return { ok: true };
}

/**
 * Valida el porcentaje ACUMULADO de concursos que recaería sobre un mismo día.
 * El menaje del 10% va aparte y siempre se descuenta.
 */
export function validateTotalContestPercent(total: number): PercentValidation {
  if (!Number.isFinite(total)) {
    return { ok: false, error: "El porcentaje total debe ser un número válido" };
  }
  if (round2(total) > TIP_CONTEST_MAX_PERCENT) {
    return {
      ok: false,
      error:
        `Los concursos no pueden descontar más del ${TIP_CONTEST_MAX_PERCENT}% de las propinas ` +
        `(el total con el menaje quedaría en ${round2(total + TIP_MENAJE_PERCENT)}%, ` +
        `por encima del tope del ${TIP_DEDUCTION_MAX_PERCENT}%)`,
    };
  }
  return { ok: true };
}

// ─── Reparto del premio entre varios ganadores ───────────────────────────────

/**
 * Divide `base` en `winnerCount` partes enteras iguales. El residuo se asigna al
 * primero para que la suma de las partes sea SIEMPRE exactamente `base`, sin
 * perder ni inventar un peso.
 */
export function splitPrizeAmong(base: number, winnerCount: number): number[] {
  if (winnerCount <= 0) return [];
  const each = Math.floor(base / winnerCount);
  const parts = Array<number>(winnerCount).fill(each);
  parts[0] = base - each * (winnerCount - 1);
  return parts;
}

// ─── Quincena destino del pago ───────────────────────────────────────────────

/**
 * Quincena inmediatamente posterior a la que contiene `dateStr`.
 * Reutiliza getBiweeklyPeriodForDate() de utils.ts — el cálculo de quincenas no
 * se duplica en ningún sitio.
 */
export function nextBiweeklyPeriodAfter(dateStr: string): {
  periodStart: string;
  periodEnd: string;
} {
  const [year, month, day] = dateStr.split("-").map(Number);

  if (day <= 15) {
    // Estamos en la 1ª quincena → la siguiente es la 2ª del mismo mes.
    const p = getBiweeklyPeriodForDate(year, month, 16);
    return { periodStart: p.from, periodEnd: p.to };
  }

  // Estamos en la 2ª quincena → la siguiente es la 1ª del mes siguiente.
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const p = getBiweeklyPeriodForDate(nextYear, nextMonth, 1);
  return { periodStart: p.from, periodEnd: p.to };
}

export interface Installment {
  installment: number;
  periodStart: string;
  periodEnd: string;
  amount: number;
}

/**
 * Cuotas en que se paga un bono, a partir de la fecha de fin del concurso.
 *
 * - UNICO:    una cuota por el total, en la quincena siguiente al cierre.
 * - DIVIDIDO: dos cuotas, en las dos quincenas siguientes. Con monto impar el
 *             peso sobrante va a la primera, de modo que la suma sea exacta.
 */
export function computeInstallments(
  totalAmount: number,
  payoutMode: PayoutMode,
  contestEndDate: string
): Installment[] {
  if (totalAmount <= 0) return [];

  const first = nextBiweeklyPeriodAfter(contestEndDate);

  if (payoutMode === "UNICO") {
    return [{ installment: 1, ...first, amount: totalAmount }];
  }

  const second = nextBiweeklyPeriodAfter(first.periodStart);
  const firstAmount = Math.round(totalAmount / 2);
  return [
    { installment: 1, ...first, amount: firstAmount },
    { installment: 2, ...second, amount: totalAmount - firstAmount },
  ];
}

// ─── Cumplimiento de la meta y resolución del ganador ────────────────────────

/**
 * Si un resultado alcanza la meta. Solo MENOR_VALOR invierte la comparación
 * (útil para metas del tipo "menos mermas" o "menos devoluciones").
 */
export function qualifiesForGoal(
  value: number,
  goalValue: number,
  criteria: ContestCriteria
): boolean {
  return criteria === "MENOR_VALOR" ? value <= goalValue : value >= goalValue;
}

export interface ContestResultInput {
  employeeId: string;
  value: number;
  achievedAt: Date | null;
}

export interface ResolveWinnersInput {
  criteria: ContestCriteria;
  goalValue: number;
  winnerMode: WinnerMode;
  results: ContestResultInput[];
  /** Solo para criteria = SELECCION_MANUAL */
  manualEmployeeIds?: string[];
}

export type ResolveWinnersFailure =
  /** Nadie alcanzó la meta: el ítem solo puede declararse DESIERTO. */
  | "SIN_CALIFICADOS"
  /** Varios empatados en el primer puesto: el sistema no elige por su cuenta. */
  | "EMPATE"
  /** El criterio es manual y no se indicó a quién premiar. */
  | "SELECCION_REQUERIDA"
  /** La selección incluye a alguien que no califica, o varios en GANADOR_UNICO. */
  | "SELECCION_INVALIDA";

export type ResolveWinnersResult =
  | { ok: true; winners: ContestResultInput[] }
  | { ok: false; reason: ResolveWinnersFailure; candidates: ContestResultInput[] };

/**
 * Clave de orden: menor es mejor. Permite tratar los tres criterios automáticos
 * con el mismo código y detectar empates comparando claves exactas.
 */
function rankKey(r: ContestResultInput, criteria: ContestCriteria): number {
  switch (criteria) {
    case "MAYOR_VALOR":
      return -r.value;
    case "MENOR_VALOR":
      return r.value;
    case "PRIMERO_EN_ALCANZAR":
      // Los que no tienen fecha ya fueron descartados antes de llegar aquí.
      return r.achievedAt ? r.achievedAt.getTime() : Number.POSITIVE_INFINITY;
    default:
      return 0;
  }
}

/**
 * Determina quién gana un ítem.
 *
 * Reglas:
 * - Solo compiten quienes ALCANZAN la meta. Si nadie lo hace, el ítem es DESIERTO
 *   y su reserva se devuelve a los empleados vía recálculo.
 * - GANADOR_UNICO se lleva todo. Si hay empate en el primer puesto, el sistema NO
 *   elige: devuelve EMPATE y exige selección manual.
 * - REPARTIDO divide el premio entre TODOS los que cumplieron la meta.
 */
export function resolveWinners(input: ResolveWinnersInput): ResolveWinnersResult {
  const { criteria, goalValue, winnerMode, results, manualEmployeeIds } = input;

  let qualified = results.filter((r) => qualifiesForGoal(r.value, goalValue, criteria));

  // Sin fecha de logro no se puede saber quién llegó primero.
  if (criteria === "PRIMERO_EN_ALCANZAR") {
    qualified = qualified.filter((r) => r.achievedAt != null);
  }

  if (qualified.length === 0) {
    return { ok: false, reason: "SIN_CALIFICADOS", candidates: [] };
  }

  if (criteria === "SELECCION_MANUAL") {
    if (!manualEmployeeIds || manualEmployeeIds.length === 0) {
      return { ok: false, reason: "SELECCION_REQUERIDA", candidates: qualified };
    }
    const unique = [...new Set(manualEmployeeIds)];
    if (winnerMode === "GANADOR_UNICO" && unique.length > 1) {
      return { ok: false, reason: "SELECCION_INVALIDA", candidates: qualified };
    }
    const picked = unique.map((id) => qualified.find((q) => q.employeeId === id));
    if (picked.some((p) => p === undefined)) {
      return { ok: false, reason: "SELECCION_INVALIDA", candidates: qualified };
    }
    return { ok: true, winners: picked as ContestResultInput[] };
  }

  if (winnerMode === "REPARTIDO") {
    return { ok: true, winners: qualified };
  }

  const bestKey = Math.min(...qualified.map((q) => rankKey(q, criteria)));
  const tied = qualified.filter((q) => rankKey(q, criteria) === bestKey);

  if (tied.length > 1) {
    return { ok: false, reason: "EMPATE", candidates: tied };
  }
  return { ok: true, winners: tied };
}

// ─── Utilidades de presentación ──────────────────────────────────────────────

/** Texto congelado de la meta que se guarda en el bono ("240 unidades"). */
export function formatGoalSnapshot(goalValue: number, goalUnit: string): string {
  return `${goalValue} ${goalUnit}`;
}

/** Estado del bono según lo pagado. No incluye ANULADO, que es una acción explícita. */
export function bonusStatusFor(totalAmount: number, paidAmount: number): ContestBonusStatus {
  if (paidAmount <= 0) return "PENDIENTE";
  if (paidAmount >= totalAmount) return "PAGADO";
  return "PARCIAL";
}
