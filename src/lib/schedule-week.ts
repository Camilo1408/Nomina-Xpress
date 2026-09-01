/**
 * Utilidades de semana para el módulo de horarios.
 *
 * Todas las fechas son strings `"YYYY-MM-DD"` y toda la aritmética se hace con
 * `new Date(año, mes - 1, día)` en hora local, nunca parseando un ISO: parsear
 * `"2026-08-31"` con `new Date(string)` lo interpreta como UTC y, en Colombia
 * (UTC-5), devuelve el día anterior. Ese fue el origen del desfase que tenían
 * las vistas al calcular los días de la semana.
 */

/** Convierte `"YYYY-MM-DD"` en un `Date` local a medianoche. */
function toLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Formatea un `Date` local como `"YYYY-MM-DD"`. */
function toDateStr(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Devuelve la fecha desplazada `n` días (acepta negativos). */
export function addDays(dateStr: string, n: number): string {
  const d = toLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Los 7 días de la semana que arranca en `weekStart`, en orden. */
export function getWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

/**
 * Etiqueta corta del día ("Lun", "Mar"…) derivada de la fecha real.
 *
 * Antes las cabeceras usaban un arreglo fijo por índice de columna, lo que solo
 * era correcto si la semana empezaba en lunes. Ahora que el admin elige el día
 * de inicio, la etiqueta tiene que salir de la fecha.
 */
export function dayLabelFor(dateStr: string): string {
  return DAY_LABELS[toLocalDate(dateStr).getDay()];
}

/** Nombre completo del día, en minúsculas ("lunes", "domingo"…). */
export function dayNameFor(dateStr: string): string {
  return DAY_NAMES[toLocalDate(dateStr).getDay()];
}

/** Si la fecha cae en domingo (día de tarifa especial). */
export function isSunday(dateStr: string): boolean {
  return toLocalDate(dateStr).getDay() === 0;
}

/** `"2026-08-31"` → `"31/08"`, para las cabeceras de la parrilla. */
export function formatDayNumber(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

/** El lunes de la semana en la que cae `dateStr`. */
export function getMonday(dateStr: string): string {
  const d = toLocalDate(dateStr);
  const day = d.getDay();
  // getDay(): domingo = 0. Un domingo pertenece a la semana que empezó 6 días
  // antes, no a la que empieza al día siguiente.
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(dateStr, diff);
}

/**
 * Fecha de inicio propuesta para un horario nuevo.
 *
 * `lastCoveredDay` es el último día ya cubierto por el horario más reciente
 * (su `weekStart + 6`), o `null` si no hay horarios.
 *
 * Si ese último día todavía no ha pasado, el horario nuevo arranca al día
 * siguiente. Así, cuando el domingo que cierra la semana vigente ya está
 * asignado, el horario nuevo empieza el lunes siguiente en vez de caer otra vez
 * sobre una semana ya consumida.
 *
 * Si no hay horarios, o el último ya quedó atrás, se propone el lunes de la
 * semana en curso — el comportamiento que tenía el sistema antes.
 */
export function suggestWeekStart(
  lastCoveredDay: string | null,
  today: string
): string {
  if (lastCoveredDay && lastCoveredDay >= today) {
    return addDays(lastCoveredDay, 1);
  }
  return getMonday(today);
}

/** Un horario existente, reducido al rango de días que ocupa. */
export interface WeekRange {
  id: string;
  name: string;
  /** Primer día cubierto, `"YYYY-MM-DD"`. */
  start: string;
  /** Último día cubierto, `"YYYY-MM-DD"`. */
  end: string;
}

/**
 * Horarios existentes cuyo rango se cruza con la semana que arranca en
 * `weekStart`. `excludeId` deja fuera el horario que se está editando.
 *
 * Solapar no está prohibido — puede haber razones legítimas — así que esto
 * alimenta un aviso, no un bloqueo.
 */
export function findOverlaps(
  weekStart: string,
  ranges: WeekRange[],
  excludeId?: string
): WeekRange[] {
  const end = addDays(weekStart, 6);
  return ranges.filter(
    (r) => r.id !== excludeId && r.start <= end && r.end >= weekStart
  );
}
