import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns today's date as "YYYY-MM-DD" in Colombia timezone (UTC-5, no DST). */
export function todayColombia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getPeriodBounds(
  type: "first" | "second",
  date: Date
): { from: Date; to: Date } {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (type === "first") {
    return { from: new Date(year, month, 1), to: new Date(year, month, 15) };
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: new Date(year, month, 16),
    to: new Date(year, month, lastDay),
  };
}

/**
 * Devuelve el último día (28–31) de un mes concreto, calculado dinámicamente.
 * `month` es 1-based (1 = enero). Independiente de la zona horaria: solo lee
 * los componentes locales de una fecha construida localmente.
 */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Quincena fija que contiene la fecha dada (mes 1-based, día 1–31):
 *   - Primera quincena: día 1 → 15.
 *   - Segunda quincena: día 16 → último día real del mes (28/29/30/31).
 * Devuelve strings "YYYY-MM-DD" construidos manualmente (sin `toISOString`),
 * para no depender de la zona horaria del navegador.
 */
export function getBiweeklyPeriodForDate(
  year: number,
  month: number,
  day: number
): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const mm = pad(month);
  if (day <= 15) {
    return { from: `${year}-${mm}-01`, to: `${year}-${mm}-15` };
  }
  return { from: `${year}-${mm}-16`, to: `${year}-${mm}-${pad(lastDayOfMonth(year, month))}` };
}

/**
 * Quincena fija actual según la fecha de HOY en zona horaria de Colombia
 * (evita elegir la quincena equivocada cerca de medianoche / cambio de mes
 * cuando el navegador está en otra zona). Período por defecto de los filtros
 * de reportes y registros.
 */
export function getCurrentBiweeklyPeriod(): { from: string; to: string } {
  const [year, month, day] = todayColombia().split("-").map(Number);
  return getBiweeklyPeriodForDate(year, month, day);
}

export function formatDate(date: Date | string): string {
  let d: Date;
  if (typeof date === "string") {
    // "YYYY-MM-DD" strings must be parsed as LOCAL time.
    // new Date("YYYY-MM-DD") parses as UTC midnight, which in UTC-5 shifts to the previous day.
    const parts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    d = parts
      ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
      : new Date(date);
  } else {
    d = date;
  }
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  });
}
