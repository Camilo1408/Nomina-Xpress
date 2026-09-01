/**
 * Reglas del día de descanso en un horario.
 *
 * Una celda (empleado × día) de un horario tiene tres estados posibles:
 *
 *   - Sin asignar → no existe la fila. El empleado no ve nada.
 *   - Turno       → fila con horas y `restDay: false`.
 *   - Descansa    → fila con `restDay: true`.
 *
 * `startTime` y `endTime` son NOT NULL en la base de datos: SQLite no permite
 * `ALTER COLUMN`, y volverlas nullable obligaría a reconstruir la tabla en
 * producción, algo que no es idempotente ni fácil de revertir. Por eso un día
 * de descanso guarda el centinela `"00:00"`.
 *
 * INVARIANTE: cuando `restDay` es `true`, las horas guardadas no significan
 * nada y no deben leerse ni mostrarse. Este módulo es el único lugar que
 * conoce el centinela — todo lo demás consume `toShiftDTO`, que ya devuelve
 * `null` en las horas de un descanso.
 */

/** Valor guardado en las horas de un día de descanso. Sin significado horario. */
export const REST_DAY_SENTINEL = "00:00";

/** Fila tal y como se persiste en `ScheduleShift`. */
export interface ShiftRow {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  startTime2: string | null;
  endTime2: string | null;
  restDay: boolean;
}

/** Fila tal y como viaja al cliente: un descanso nunca expone horas. */
export interface ShiftDTO {
  date: string;
  startTime: string | null;
  endTime: string | null;
  startTime2: string | null;
  endTime2: string | null;
  restDay: boolean;
}

/** Lo mínimo que necesita `toShiftDTO` para normalizar una fila. */
type ShiftLike = {
  startTime: string;
  endTime: string;
  startTime2: string | null;
  endTime2: string | null;
  restDay: boolean;
};

export interface WorkShiftInput {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  startTime2?: string | null;
  endTime2?: string | null;
}

/**
 * Construye la fila de un día de descanso. Nunca lleva horas reales ni segundo
 * turno, sin importar lo que traiga el payload del cliente.
 */
export function buildRestDayShift(employeeId: string, date: string): ShiftRow {
  return {
    employeeId,
    date,
    startTime: REST_DAY_SENTINEL,
    endTime: REST_DAY_SENTINEL,
    startTime2: null,
    endTime2: null,
    restDay: true,
  };
}

/** Construye la fila de un turno normal, normalizando el 2.º turno vacío a `null`. */
export function buildWorkShift(input: WorkShiftInput): ShiftRow {
  return {
    employeeId: input.employeeId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    startTime2: input.startTime2 || null,
    endTime2: input.endTime2 || null,
    restDay: false,
  };
}

/**
 * Normaliza una fila de la base de datos para el cliente.
 *
 * Conserva el resto de campos (id, employee, …) y solo blanquea las horas
 * cuando la fila es un descanso, de modo que el centinela nunca sale de aquí.
 */
export function toShiftDTO<T extends ShiftLike>(
  shift: T
): Omit<T, "startTime" | "endTime"> & {
  startTime: string | null;
  endTime: string | null;
} {
  if (shift.restDay) {
    return {
      ...shift,
      startTime: null,
      endTime: null,
      startTime2: null,
      endTime2: null,
    };
  }
  return { ...shift };
}

/** Si una fila representa un turno con horas utilizables. */
export function isWorkShift(shift: ShiftLike): boolean {
  return !shift.restDay;
}
