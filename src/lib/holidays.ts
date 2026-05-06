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
 */
export function isSpecialDay(dateOrStr: Date | string): boolean {
  const date = typeof dateOrStr === "string" ? dateFromString(dateOrStr) : dateOrStr;
  // Usar getUTCDay() para consistencia independiente de zona horaria del servidor
  return date.getUTCDay() === 0 || isColombianHoliday(date);
}
