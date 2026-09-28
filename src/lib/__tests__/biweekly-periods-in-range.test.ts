import { describe, it, expect } from "vitest";
import { biweeklyPeriodsInRange, isFirstHalf } from "../bonuses";

describe("biweeklyPeriodsInRange — quincenas cubiertas por el rango de un reporte", () => {
  it("un rango que ES la primera quincena devuelve solo esa quincena", () => {
    expect(biweeklyPeriodsInRange("2026-07-01", "2026-07-15")).toEqual([
      { start: "2026-07-01", firstHalf: true },
    ]);
  });

  it("un rango que ES la segunda quincena devuelve solo esa quincena", () => {
    expect(biweeklyPeriodsInRange("2026-07-16", "2026-07-31")).toEqual([
      { start: "2026-07-16", firstHalf: false },
    ]);
  });

  it("funciona con meses cortos (febrero de 28 días)", () => {
    expect(biweeklyPeriodsInRange("2026-02-16", "2026-02-28")).toEqual([
      { start: "2026-02-16", firstHalf: false },
    ]);
  });

  it("un mes completo devuelve sus dos quincenas, en orden y sin repetir", () => {
    expect(biweeklyPeriodsInRange("2026-07-01", "2026-07-31")).toEqual([
      { start: "2026-07-01", firstHalf: true },
      { start: "2026-07-16", firstHalf: false },
    ]);
  });

  it("dos meses devuelven cuatro quincenas", () => {
    expect(biweeklyPeriodsInRange("2026-06-01", "2026-07-31")).toEqual([
      { start: "2026-06-01", firstHalf: true },
      { start: "2026-06-16", firstHalf: false },
      { start: "2026-07-01", firstHalf: true },
      { start: "2026-07-16", firstHalf: false },
    ]);
  });

  it("cruza el fin de año correctamente", () => {
    expect(biweeklyPeriodsInRange("2026-12-16", "2027-01-15")).toEqual([
      { start: "2026-12-16", firstHalf: false },
      { start: "2027-01-01", firstHalf: true },
    ]);
  });

  it("no cuenta una quincena cuyo inicio queda fuera del rango", () => {
    // 07-16 empieza después del 07-20? no: empieza el 16, dentro. La de 07-01 no.
    expect(biweeklyPeriodsInRange("2026-07-10", "2026-07-20")).toEqual([
      { start: "2026-07-16", firstHalf: false },
    ]);
  });

  it("un rango sin ningún inicio de quincena cae al comportamiento histórico (una sola aplicación)", () => {
    const periods = biweeklyPeriodsInRange("2026-07-05", "2026-07-12");
    expect(periods).toEqual([{ start: "2026-07-05", firstHalf: true }]);
    expect(periods[0].firstHalf).toBe(isFirstHalf("2026-07-05"));
  });

  it("un rango de un solo día cae al comportamiento histórico", () => {
    expect(biweeklyPeriodsInRange("2026-07-20", "2026-07-20")).toEqual([
      { start: "2026-07-20", firstHalf: false },
    ]);
  });

  it("un rango invertido no explota: cae al comportamiento histórico", () => {
    expect(biweeklyPeriodsInRange("2026-07-15", "2026-07-01")).toEqual([
      { start: "2026-07-15", firstHalf: true },
    ]);
  });

  it("una fecha con formato inválido cae al comportamiento histórico", () => {
    expect(biweeklyPeriodsInRange("2026-07-01", "no-es-fecha")).toEqual([
      { start: "2026-07-01", firstHalf: true },
    ]);
  });

  it("un rango absurdo queda acotado y no genera una iteración infinita", () => {
    const periods = biweeklyPeriodsInRange("2000-01-01", "2999-12-31");
    expect(periods.length).toBeLessThanOrEqual(242);
    expect(periods[0]).toEqual({ start: "2000-01-01", firstHalf: true });
  });

  it("cada quincena aparece UNA sola vez (no hay doble conteo en rangos largos)", () => {
    const periods = biweeklyPeriodsInRange("2026-01-01", "2026-12-31");
    const starts = periods.map((p) => p.start);
    expect(starts.length).toBe(24);
    expect(new Set(starts).size).toBe(24);
  });
});
