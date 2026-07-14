import Holidays from "date-holidays";

const hd = new Holidays("CO");

/**
 * Dado un string de fecha "YYYY-MM-DD", devuelve un Date a mediodia UTC.
 * Usar mediodia UTC garantiza que Colombia (UTC-5) siempre esté en el mismo día
 * sin importar la zona horaria del servidor.
 */
export function dateFromString(dateStr: string): Date {
  return new Date(dateStr + "T12:00:00Z");
}

/**
 * Devuelve true si la fecha es festivo colombiano.
 * Usa try/catch para no romper si date-holidays falla en algún caso borde.
 */
export function isColombianHoliday(date: Date): boolean {
  try {
    const result = hd.isHoliday(date);
    return result !== false && result != null;
  } catch {
    return false;
  }
}

/**
 * Devuelve true si la fecha es domingo o festivo colombiano.
 * Si un día es ambos (domingo festivo), se trata como un solo día especial.
 * Acepta tanto Date como string "YYYY-MM-DD".
 *
 * NOTA: solo considera domingos y festivos NACIONALES (Ley Emiliani). Para
 * incluir además los festivos personalizados por cliente (decretos locales),
 * usar `isSpecialDayForTenant` de `@/lib/special-days` (requiere base de datos).
 */
export function isSpecialDay(dateOrStr: Date | string): boolean {
  const date = typeof dateOrStr === "string" ? dateFromString(dateOrStr) : dateOrStr;
  // Usar getUTCDay() para consistencia independiente de zona horaria del servidor
  return date.getUTCDay() === 0 || isColombianHoliday(date);
}

/**
 * Valida que (mes, día) formen una fecha real del calendario. Para festivos
 * recurrentes (sin año) usa un año bisiesto de referencia (2000) para permitir
 * el 29 de febrero. Rechaza combinaciones como 30-feb o 31-abr.
 */
export function isValidCalendarDate(month: number, day: number, year: number | null): boolean {
  const y = year ?? 2000;
  const d = new Date(y, month - 1, day);
  return d.getFullYear() === y && d.getMonth() === month - 1 && d.getDate() === day;
}

export interface NationalHoliday {
  /** "YYYY-MM-DD" */
  date: string;
  name: string;
}

/**
 * Lista los festivos NACIONALES colombianos de un año (los que conoce la
 * librería `date-holidays`). Se usa en la UI para mostrarlos en modo
 * solo-lectura junto a los festivos personalizados.
 */
export function listNationalHolidays(year: number): NationalHoliday[] {
  try {
    return hd
      .getHolidays(year)
      .filter((h) => h.type === "public")
      .map((h) => ({ date: h.date.slice(0, 10), name: h.name }));
  } catch {
    return [];
  }
}
