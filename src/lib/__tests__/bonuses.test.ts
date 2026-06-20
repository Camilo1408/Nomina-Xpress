import { describe, it, expect } from "vitest";
import {
  computeBonusApplied,
  bonusAppliesToEmployee,
  isFirstHalf,
} from "../bonuses";

describe("isFirstHalf", () => {
  it("días 1–15 son primera quincena", () => {
    expect(isFirstHalf("2026-06-01")).toBe(true);
    expect(isFirstHalf("2026-06-15")).toBe(true);
  });
  it("días 16+ son segunda quincena", () => {
    expect(isFirstHalf("2026-06-16")).toBe(false);
    expect(isFirstHalf("2026-06-30")).toBe(false);
  });
});

describe("computeBonusApplied — quincenal", () => {
  it("paga el valor completo en ambas quincenas", () => {
    expect(computeBonusApplied(80000, "BIWEEKLY", null, true)).toBe(80000);
    expect(computeBonusApplied(80000, "BIWEEKLY", null, false)).toBe(80000);
  });
});

describe("computeBonusApplied — mensual", () => {
  it("FIRST: completo en primera quincena, 0 en segunda", () => {
    expect(computeBonusApplied(100000, "MONTHLY", "FIRST", true)).toBe(100000);
    expect(computeBonusApplied(100000, "MONTHLY", "FIRST", false)).toBe(0);
  });
  it("SECOND: 0 en primera, completo en segunda", () => {
    expect(computeBonusApplied(100000, "MONTHLY", "SECOND", true)).toBe(0);
    expect(computeBonusApplied(100000, "MONTHLY", "SECOND", false)).toBe(100000);
  });
  it("SPLIT: mitad y mitad, suma exacta", () => {
    const first = computeBonusApplied(100000, "MONTHLY", "SPLIT", true);
    const second = computeBonusApplied(100000, "MONTHLY", "SPLIT", false);
    expect(first).toBe(50000);
    expect(second).toBe(50000);
    expect(first + second).toBe(100000);
  });
  it("SPLIT con valor impar reparte sin perder pesos", () => {
    const first = computeBonusApplied(100001, "MONTHLY", "SPLIT", true);
    const second = computeBonusApplied(100001, "MONTHLY", "SPLIT", false);
    expect(first + second).toBe(100001);
  });
});

describe("computeBonusApplied — bordes", () => {
  it("nunca devuelve negativos ni aplica monto 0", () => {
    expect(computeBonusApplied(0, "BIWEEKLY", null, true)).toBe(0);
    expect(computeBonusApplied(-500, "BIWEEKLY", null, true)).toBe(0);
  });
});

describe("bonusAppliesToEmployee", () => {
  it("ALL aplica a cualquier tipo de pago", () => {
    expect(bonusAppliesToEmployee("ALL", "PAYROLL", false)).toBe(true);
    expect(bonusAppliesToEmployee("ALL", "SHIFT", false)).toBe(true);
  });
  it("PAYROLL solo a empleados de nómina", () => {
    expect(bonusAppliesToEmployee("PAYROLL", "PAYROLL", false)).toBe(true);
    expect(bonusAppliesToEmployee("PAYROLL", "SHIFT", false)).toBe(false);
  });
  it("SHIFT solo a empleados por turnos", () => {
    expect(bonusAppliesToEmployee("SHIFT", "SHIFT", false)).toBe(true);
    expect(bonusAppliesToEmployee("SHIFT", "PAYROLL", false)).toBe(false);
  });
  it("SPECIFIC solo si hay asignación", () => {
    expect(bonusAppliesToEmployee("SPECIFIC", "PAYROLL", true)).toBe(true);
    expect(bonusAppliesToEmployee("SPECIFIC", "PAYROLL", false)).toBe(false);
  });
});
