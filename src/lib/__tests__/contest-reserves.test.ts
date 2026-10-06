// Verifica la integración de las reservas de concurso en el cálculo de propinas.
//
// La propiedad más importante de todo el módulo se prueba aquí:
//   totalAmount = menaje + Σreservas + netAmount   (siempre, al peso)

import { describe, it, expect } from "vitest";
import { calculateTips, MENAJE_PERCENT, type TipEmployeeInput } from "../tips";

const emps: TipEmployeeInput[] = [
  { id: "e1", name: "Ana", hoursWorked: 8, tipPercent: 100 },
  { id: "e2", name: "Beto", hoursWorked: 4, tipPercent: 100 },
  { id: "e3", name: "Caro", hoursWorked: 6, tipPercent: 50 },
];

// ─── Compatibilidad con el comportamiento histórico ──────────────────────────

describe("calculateTips sin deducciones de concurso", () => {
  it("se comporta exactamente igual que antes del módulo", () => {
    const calc = calculateTips(1_000_000, emps);
    expect(calc.menaje).toBe(100_000);
    expect(calc.netAmount).toBe(900_000);
    expect(calc.contestReserved).toBe(0);
    expect(calc.contestReserves).toEqual([]);
  });

  it("una lista de deducciones vacía da el mismo resultado que omitir el parámetro", () => {
    const sinParam = calculateTips(777_777, emps);
    const conVacio = calculateTips(777_777, emps, []);
    expect(conVacio).toEqual(sinParam);
  });

  it("MENAJE_PERCENT sigue siendo el 10%", () => {
    expect(MENAJE_PERCENT).toBe(0.1);
  });
});

// ─── El ejemplo del brief ────────────────────────────────────────────────────

describe("ejemplo del brief: 10% menaje + 2% cervezas + 1% vinos", () => {
  const calc = calculateTips(5_000_000, emps, [
    { contestId: "c1", contestItemId: "i-cervezas", percent: 2 },
    { contestId: "c1", contestItemId: "i-vinos", percent: 1 },
  ]);

  it("descuenta el 13% del fondo original", () => {
    expect(calc.menaje).toBe(500_000);
    expect(calc.contestReserved).toBe(150_000);
    expect(calc.menaje + calc.contestReserved).toBe(650_000); // 13%
  });

  it("deja el 87% para repartir entre los empleados", () => {
    expect(calc.netAmount).toBe(4_350_000);
  });

  it("guarda el dinero de cada ítem por separado", () => {
    expect(calc.contestReserves).toEqual([
      { contestId: "c1", contestItemId: "i-cervezas", percent: 2, amount: 100_000 },
      { contestId: "c1", contestItemId: "i-vinos", percent: 1, amount: 50_000 },
    ]);
  });

  it("reparte sobre el neto reducido, no sobre el 90%", () => {
    const sinConcurso = calculateTips(5_000_000, emps);
    const totalCon = calc.distributions.reduce((s, d) => s + d.amount, 0);
    const totalSin = sinConcurso.distributions.reduce((s, d) => s + d.amount, 0);
    expect(totalCon).toBeLessThan(totalSin);
    expect(totalCon).toBeLessThanOrEqual(calc.netAmount);
  });
});

// ─── La invariante ───────────────────────────────────────────────────────────

describe("invariante total = menaje + reservas + neto", () => {
  it("se cumple al peso en un barrido amplio de montos y porcentajes", () => {
    const montos = [1, 7, 99, 1_337, 100_000, 333_333, 999_999, 5_000_000, 12_345_678];
    const combos: number[][] = [
      [],
      [2],
      [1, 1],
      [2, 1, 1],
      [0.5, 0.25],
      [7.77],
      [3.33, 3.33, 3.33],
      [20],
      [19.99, 0.01],
    ];

    for (const total of montos) {
      for (const percents of combos) {
        const calc = calculateTips(
          total,
          emps,
          percents.map((p, i) => ({ contestId: "c", contestItemId: `i${i}`, percent: p }))
        );
        const suma =
          calc.menaje +
          calc.contestReserves.reduce((s, r) => s + r.amount, 0) +
          calc.netAmount;
        expect(suma).toBe(total);
        expect(calc.contestReserved).toBe(
          calc.contestReserves.reduce((s, r) => s + r.amount, 0)
        );
      }
    }
  });

  it("el neto nunca es negativo ni fraccionario", () => {
    const calc = calculateTips(1_000, emps, [
      { contestId: "c", contestItemId: "i1", percent: 20 },
    ]);
    expect(calc.netAmount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(calc.netAmount)).toBe(true);
  });

  it("cada reserva es un entero de pesos", () => {
    const calc = calculateTips(333_333, emps, [
      { contestId: "c", contestItemId: "i1", percent: 3.33 },
      { contestId: "c", contestItemId: "i2", percent: 1.11 },
    ]);
    for (const r of calc.contestReserves) {
      expect(Number.isInteger(r.amount)).toBe(true);
    }
  });
});

// ─── Redondeo: la suma diaria es la cifra válida ─────────────────────────────

describe("redondeo por día", () => {
  it("la suma de reservas diarias puede diferir del porcentaje del total, y eso es correcto", () => {
    // Tres días de 3.333 pesos al 3%: cada día round(99.99) = 100
    const dias = [3_333, 3_333, 3_333];
    const sumaDiaria = dias
      .map((d) => calculateTips(d, emps, [{ contestId: "c", contestItemId: "i", percent: 3 }]))
      .reduce((s, c) => s + c.contestReserved, 0);

    const porcentajeDelTotal = Math.round((3_333 * 3) * 0.03);

    expect(sumaDiaria).toBe(300);
    expect(porcentajeDelTotal).toBe(300); // aquí coinciden
    // Pero la cifra que manda es la suma diaria, porque es la que se descontó:
    expect(sumaDiaria).toBe(
      dias.reduce((s, d) => s + Math.round(d * 0.03), 0)
    );
  });
});

// ─── Guardas duras ───────────────────────────────────────────────────────────

describe("guardas de seguridad", () => {
  it("rechaza deducciones que superen el tope del 20%", () => {
    expect(() =>
      calculateTips(1_000_000, emps, [
        { contestId: "c", contestItemId: "i1", percent: 15 },
        { contestId: "c", contestItemId: "i2", percent: 6 },
      ])
    ).toThrow(/tope/i);
  });

  it("acepta exactamente el tope del 20%", () => {
    expect(() =>
      calculateTips(1_000_000, emps, [
        { contestId: "c", contestItemId: "i1", percent: 15 },
        { contestId: "c", contestItemId: "i2", percent: 5 },
      ])
    ).not.toThrow();
  });

  it("rechaza un porcentaje negativo", () => {
    expect(() =>
      calculateTips(1_000_000, emps, [
        { contestId: "c", contestItemId: "i1", percent: -1 },
      ])
    ).toThrow();
  });

  it("rechaza ítems duplicados en la misma llamada", () => {
    expect(() =>
      calculateTips(1_000_000, emps, [
        { contestId: "c", contestItemId: "dup", percent: 2 },
        { contestId: "c", contestItemId: "dup", percent: 1 },
      ])
    ).toThrow(/duplicad/i);
  });
});

// ─── Reservas congeladas de concursos ya finalizados ────────────────────────

describe("reservas congeladas (fixedAmount)", () => {
  it("usa el monto congelado en vez de recalcularlo del porcentaje", () => {
    // El concurso se finalizó cuando el día valía 1.000.000 → reservó 20.000.
    // Después se corrige el total del día a 2.000.000: la reserva NO se mueve.
    const calc = calculateTips(2_000_000, emps, [
      { contestId: "c", contestItemId: "i", percent: 2, fixedAmount: 20_000 },
    ]);
    expect(calc.contestReserved).toBe(20_000);
    expect(calc.netAmount).toBe(2_000_000 - 200_000 - 20_000);
  });

  it("mantiene la invariante con reservas congeladas y vivas mezcladas", () => {
    const total = 1_000_000;
    const calc = calculateTips(total, emps, [
      { contestId: "c1", contestItemId: "congelada", percent: 2, fixedAmount: 33_333 },
      { contestId: "c2", contestItemId: "viva", percent: 1 },
    ]);
    expect(calc.contestReserves.map((r) => r.amount)).toEqual([33_333, 10_000]);
    expect(calc.menaje + calc.contestReserved + calc.netAmount).toBe(total);
  });

  it("rechaza el cálculo si lo congelado ya no cabe en el total del día", () => {
    // Se baja el total a 50.000 pero hay 45.000 congelados + 5.000 de menaje.
    expect(() =>
      calculateTips(50_000, emps, [
        { contestId: "c", contestItemId: "i", percent: 2, fixedAmount: 46_000 },
      ])
    ).toThrow(/supera las propinas del día/i);
  });
});

// ─── Sin empleados ───────────────────────────────────────────────────────────

describe("día sin empleados con horas", () => {
  it("reserva igual el dinero del concurso y deja el neto sin repartir", () => {
    const calc = calculateTips(1_000_000, [], [
      { contestId: "c", contestItemId: "i", percent: 2 },
    ]);
    expect(calc.menaje).toBe(100_000);
    expect(calc.contestReserved).toBe(20_000);
    expect(calc.netAmount).toBe(880_000);
    expect(calc.distributions).toEqual([]);
    expect(calc.ratePerHour).toBe(0);
  });
});
