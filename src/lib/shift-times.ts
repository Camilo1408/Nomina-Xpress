import { calculateHours } from "./payroll";

/**
 * Reglas compartidas (cliente + servidor) para turnos que cruzan la medianoche
 * y para el tope de horas diarias por empleado.
 *
 * Un turno puede terminar en la MADRUGADA del día siguiente, como máximo a las
 * 2:00 AM. En ese caso el registro conserva su `date` = día de inicio, y todas
 * las horas (incluidas las de la madrugada) se pagan a la tarifa de ese día.
 */

/** Minuto del día (00:00–02:00) hasta el que se permite cruzar la medianoche. */
export const MAX_OVERNIGHT_END_MINUTES = 120; // 02:00

/** Máximo de horas que un empleado puede trabajar en un día (suma de turnos). */
export const MAX_DAILY_HOURS = 15;

export const OVERNIGHT_LIMIT_ERROR =
  "La salida solo puede cruzar la medianoche hasta las 2:00 AM. Verifica la hora de salida.";
const CHECKOUT_BEFORE_ERROR =
  "La hora de salida debe ser posterior a la hora de entrada.";

export type ShiftKind = "same-day" | "overnight" | "invalid";

export type BuildShiftResult =
  | { ok: true; checkIn: string; checkOut: string | null; crossesMidnight: boolean }
  | { ok: false; error: string };

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Devuelve "YYYY-MM-DD" del día siguiente, sin depender de la zona horaria. */
function addOneDay(dateStr: string): string {
  const [y, mo, da] = dateStr.split("-").map(Number);
  const d = new Date(y, mo - 1, da);
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Construye un ISO en hora local a partir de "YYYY-MM-DD" + "HH:mm". */
function buildLocalIso(date: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(date + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/**
 * Clasifica un turno según sus horas "HH:mm":
 *   - "same-day": la salida es posterior a la entrada el mismo día.
 *   - "overnight": la salida es ≤ la entrada pero cae a más tardar a las 02:00
 *     (cruza la medianoche legítimamente).
 *   - "invalid": la salida es ≤ la entrada y cae después de las 02:00.
 */
export function classifyShift(checkInTime: string, checkOutTime: string): ShiftKind {
  const inMin = timeToMinutes(checkInTime);
  const outMin = timeToMinutes(checkOutTime);
  if (outMin > inMin) return "same-day";
  if (outMin <= MAX_OVERNIGHT_END_MINUTES) return "overnight";
  return "invalid";
}

/**
 * Construye los ISO de entrada/salida aplicando el cruce de medianoche.
 * Si la salida está vacía → sólo entrada (checkOut null). Uso en el cliente.
 */
export function buildShiftDateTimes(
  date: string,
  checkInTime: string,
  checkOutTime: string
): BuildShiftResult {
  const checkIn = buildLocalIso(date, checkInTime);
  if (!checkOutTime) {
    return { ok: true, checkIn, checkOut: null, crossesMidnight: false };
  }
  const kind = classifyShift(checkInTime, checkOutTime);
  if (kind === "invalid") {
    return { ok: false, error: OVERNIGHT_LIMIT_ERROR };
  }
  const outDate = kind === "overnight" ? addOneDay(date) : date;
  return {
    ok: true,
    checkIn,
    checkOut: buildLocalIso(outDate, checkOutTime),
    crossesMidnight: kind === "overnight",
  };
}

/** Día ("YYYY-MM-DD") y minuto del día de una fecha, en zona `America/Bogota`. */
function bogotaDayAndMinutes(d: Date): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return { day, minutes };
}

/**
 * Valida (en el servidor) que la salida sea posterior a la entrada y que caiga
 * dentro de la ventana permitida: el mismo día de inicio, o el día siguiente a
 * más tardar a las 02:00 (hora de Colombia). Una salida vacía es válida.
 */
export function validateShiftWindow(
  date: string,
  checkIn: Date,
  checkOut: Date | null
): { ok: true } | { ok: false; error: string } {
  if (!checkOut) return { ok: true };
  if (checkOut.getTime() <= checkIn.getTime()) {
    return { ok: false, error: CHECKOUT_BEFORE_ERROR };
  }
  const nextDay = addOneDay(date);
  const { day, minutes } = bogotaDayAndMinutes(checkOut);
  if (day === date) return { ok: true };
  if (day === nextDay && minutes <= MAX_OVERNIGHT_END_MINUTES) return { ok: true };
  return { ok: false, error: OVERNIGHT_LIMIT_ERROR };
}

export interface DailyShift {
  checkIn: Date;
  checkOut: Date | null;
  checkIn2: Date | null;
  checkOut2: Date | null;
}

function entryHours(entry: DailyShift): number {
  let hours = 0;
  if (entry.checkOut) hours += calculateHours(entry.checkIn, entry.checkOut);
  if (entry.checkIn2 && entry.checkOut2) {
    hours += calculateHours(entry.checkIn2, entry.checkOut2);
  }
  return hours;
}

/** Suma las horas trabajadas de un conjunto de registros del mismo día. */
export function sumDailyHours(entries: DailyShift[]): number {
  return entries.reduce((sum, entry) => sum + entryHours(entry), 0);
}
