import { describe, it, expect } from "vitest";
import { lastDayOfMonth, getBiweeklyPeriodForDate } from "../utils";

describe("lastDayOfMonth — último día dinámico (28/29/30/31)", () => {
  it("febrero en año no bisiesto → 28", () => {
    expect(lastDayOfMonth(2025, 2)).toBe(28);
  });

  it("febrero en año bisiesto → 29", () => {
    expect(lastDayOfMonth(2024, 2)).toBe(29);
    expect(lastDayOfMonth(2028, 2)).toBe(29);
  });

  it("meses de 30 días", () => {
    expect(lastDayOfMonth(2026, 4)).toBe(30); // abril
    expect(lastDayOfMonth(2026, 6)).toBe(30); // junio
    expect(lastDayOfMonth(2026, 9)).toBe(30); // septiembre
    expect(lastDayOfMonth(2026, 11)).toBe(30); // noviembre
  });

  it("meses de 31 días", () => {
    expect(lastDayOfMonth(2026, 1)).toBe(31); // enero
    expect(lastDayOfMonth(2026, 7)).toBe(31); // julio
    expect(lastDayOfMonth(2026, 12)).toBe(31); // diciembre
  });
});

describe("getBiweeklyPeriodForDate — quincenas fijas", () => {
  it("día 1–15 → primera quincena (1 al 15)", () => {
    expect(getBiweeklyPeriodForDate(2026, 7, 1)).toEqual({ from: "2026-07-01", to: "2026-07-15" });
    expect(getBiweeklyPeriodForDate(2026, 7, 10)).toEqual({ from: "2026-07-01", to: "2026-07-15" });
    expect(getBiweeklyPeriodForDate(2026, 7, 15)).toEqual({ from: "2026-07-01", to: "2026-07-15" });
  });

  it("día 16 → segunda quincena (borde inferior)", () => {
    expect(getBiweeklyPeriodForDate(2026, 7, 16)).toEqual({ from: "2026-07-16", to: "2026-07-31" });
  });

  it("segunda quincena de febrero no bisiesto termina el 28", () => {
    expect(getBiweeklyPeriodForDate(2025, 2, 20)).toEqual({ from: "2025-02-16", to: "2025-02-28" });
  });

  it("segunda quincena de febrero bisiesto termina el 29", () => {
    expect(getBiweeklyPeriodForDate(2024, 2, 28)).toEqual({ from: "2024-02-16", to: "2024-02-29" });
  });

  it("segunda quincena de un mes de 30 días termina el 30", () => {
    expect(getBiweeklyPeriodForDate(2026, 4, 30)).toEqual({ from: "2026-04-16", to: "2026-04-30" });
  });

  it("segunda quincena de un mes de 31 días termina el 31", () => {
    expect(getBiweeklyPeriodForDate(2026, 1, 31)).toEqual({ from: "2026-01-16", to: "2026-01-31" });
    expect(getBiweeklyPeriodForDate(2026, 12, 25)).toEqual({ from: "2026-12-16", to: "2026-12-31" });
  });

  it("rellena con cero el mes de un dígito (formato YYYY-MM-DD)", () => {
    expect(getBiweeklyPeriodForDate(2026, 3, 5)).toEqual({ from: "2026-03-01", to: "2026-03-15" });
  });
});
