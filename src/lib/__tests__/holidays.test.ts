import { describe, it, expect } from "vitest";
import {
  isSpecialDay,
  isColombianHoliday,
  listNationalHolidays,
  isValidCalendarDate,
  dateFromString,
} from "../holidays";

describe("listNationalHolidays", () => {
  it("incluye el 20 de julio (Independencia) en 2026", () => {
    const list = listNationalHolidays(2026);
    expect(list.some((h) => h.date === "2026-07-20")).toBe(true);
  });

  it("incluye 'La virgen de Chiquinquirá' el 13 de julio de 2026 (agregado en date-holidays 3.33)", () => {
    // Regresión: la 3.28 NO lo tenía; el update de la librería lo incorpora.
    const list = listNationalHolidays(2026);
    expect(list.some((h) => h.date === "2026-07-13")).toBe(true);
  });

  it("no incluye observancias (ej. Domingo de Ramos), solo festivos públicos", () => {
    const list = listNationalHolidays(2026);
    expect(list.some((h) => h.name.includes("Domingo de Ramos"))).toBe(false);
  });
});

describe("isSpecialDay — nacional/domingo", () => {
  it("el 13 de julio de 2026 ahora sí es especial (festivo nacional)", () => {
    expect(isColombianHoliday(dateFromString("2026-07-13"))).toBe(true);
    expect(isSpecialDay("2026-07-13")).toBe(true);
  });

  it("el 20 de julio de 2026 es especial (festivo nacional)", () => {
    expect(isSpecialDay("2026-07-20")).toBe(true);
  });

  it("un día laboral normal no es especial", () => {
    // 2026-07-14 es martes, sin festivo nacional → requeriría festivo custom.
    expect(dateFromString("2026-07-14").getUTCDay()).not.toBe(0);
    expect(isSpecialDay("2026-07-14")).toBe(false);
  });

  it("un domingo cualquiera es especial", () => {
    // 2026-07-12 es domingo
    expect(dateFromString("2026-07-12").getUTCDay()).toBe(0);
    expect(isSpecialDay("2026-07-12")).toBe(true);
  });
});

describe("isValidCalendarDate", () => {
  it("acepta fechas reales", () => {
    expect(isValidCalendarDate(7, 13, 2026)).toBe(true);
    expect(isValidCalendarDate(2, 28, 2025)).toBe(true);
  });

  it("acepta 29 de febrero para festivos recurrentes (year = null)", () => {
    expect(isValidCalendarDate(2, 29, null)).toBe(true);
  });

  it("rechaza 29 de febrero en año no bisiesto", () => {
    expect(isValidCalendarDate(2, 29, 2025)).toBe(false);
  });

  it("rechaza días imposibles", () => {
    expect(isValidCalendarDate(4, 31, 2026)).toBe(false);
    expect(isValidCalendarDate(2, 30, null)).toBe(false);
  });
});
