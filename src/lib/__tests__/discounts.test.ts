import { describe, it, expect } from "vitest";
import {
  computeDiscountApplied,
  discountAppliesToEmployee,
  isFirstHalf,
  clampFinalPay,
} from "../discounts";

describe("computeDiscountApplied — periodicidad", () => {
  it("quincenal: valor completo en ambas quincenas", () => {
    expect(computeDiscountApplied(80000, "BIWEEKLY", null, true)).toBe(80000);
    expect(computeDiscountApplied(80000, "BIWEEKLY", null, false)).toBe(80000);
  });
  it("mensual FIRST: solo primera quincena", () => {
    expect(computeDiscountApplied(100000, "MONTHLY", "FIRST", true)).toBe(100000);
    expect(computeDiscountApplied(100000, "MONTHLY", "FIRST", false)).toBe(0);
  });
  it("mensual SECOND: solo segunda quincena", () => {
    expect(computeDiscountApplied(100000, "MONTHLY", "SECOND", true)).toBe(0);
    expect(computeDiscountApplied(100000, "MONTHLY", "SECOND", false)).toBe(100000);
  });
  it("mensual SPLIT: mitad y mitad, suma exacta", () => {
    const a = computeDiscountApplied(100000, "MONTHLY", "SPLIT", true);
    const b = computeDiscountApplied(100000, "MONTHLY", "SPLIT", false);
    expect(a).toBe(50000);
    expect(b).toBe(50000);
    expect(a + b).toBe(100000);
  });
  it("nunca negativo", () => {
    expect(computeDiscountApplied(-5000, "BIWEEKLY", null, true)).toBe(0);
  });
});

describe("discountAppliesToEmployee", () => {
  it("ALL aplica a todos", () => {
    expect(discountAppliesToEmployee("ALL", "PAYROLL", false)).toBe(true);
    expect(discountAppliesToEmployee("ALL", "SHIFT", false)).toBe(true);
  });
  it("PAYROLL/SHIFT/SPECIFIC filtran correctamente", () => {
    expect(discountAppliesToEmployee("PAYROLL", "PAYROLL", false)).toBe(true);
    expect(discountAppliesToEmployee("PAYROLL", "SHIFT", false)).toBe(false);
    expect(discountAppliesToEmployee("SHIFT", "SHIFT", false)).toBe(true);
    expect(discountAppliesToEmployee("SPECIFIC", "PAYROLL", true)).toBe(true);
    expect(discountAppliesToEmployee("SPECIFIC", "PAYROLL", false)).toBe(false);
  });
});

describe("clampFinalPay — el total nunca queda negativo", () => {
  it("resta descuentos del neto + bonos", () => {
    // base 800.000 + propinas 120.000 + bonos 130.000 - descuentos 130.000
    expect(clampFinalPay(920000, 130000, 130000)).toBe(920000);
  });
  it("cuando los descuentos superan el total, deja 0", () => {
    expect(clampFinalPay(50000, 0, 200000)).toBe(0);
  });
  it("sin descuentos, total = neto + bonos", () => {
    expect(clampFinalPay(500000, 80000, 0)).toBe(580000);
  });
});

describe("isFirstHalf", () => {
  it("identifica primera/segunda quincena", () => {
    expect(isFirstHalf("2026-06-10")).toBe(true);
    expect(isFirstHalf("2026-06-20")).toBe(false);
  });
});
