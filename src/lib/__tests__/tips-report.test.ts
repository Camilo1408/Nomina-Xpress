import { describe, it, expect } from "vitest";
import { aggregateTipsReport, parseTipsReportRange, type TipEntryInput } from "../tips-report";

const dist = (employeeId: string, name: string, hoursWorked: number, tipPercent: number, amount: number) => ({
  employeeId,
  hoursWorked,
  tipPercent,
  effectiveHours: Math.round(hoursWorked * tipPercent) / 100,
  amount,
  employee: { name },
});

const ENTRIES: TipEntryInput[] = [
  // Viene desordenado a propósito: el reporte debe ordenar byDay ascendente.
  {
    date: "2026-09-02",
    totalAmount: 90_000,
    menaje: 9_000,
    netAmount: 81_000,
    notes: null,
    distributions: [dist("e1", "María", 7.5, 100, 81_000)],
  },
  {
    date: "2026-09-01",
    totalAmount: 120_000,
    menaje: 12_000,
    netAmount: 108_000,
    notes: "Evento privado",
    distributions: [dist("e1", "María", 8, 100, 72_000), dist("e2", "Juan", 8, 50, 36_000)],
  },
  {
    date: "2026-09-03",
    totalAmount: 10_000,
    menaje: 1_000,
    netAmount: 9_000,
    notes: null,
    distributions: [],
  },
];

describe("aggregateTipsReport", () => {
  it("suma los totales del rango", () => {
    const r = aggregateTipsReport(ENTRIES);
    expect(r.totals).toEqual({ gross: 220_000, menaje: 22_000, distributed: 198_000 });
  });

  it("agrupa por empleado con % ponderado por horas, ordenado por total desc", () => {
    const r = aggregateTipsReport(ENTRIES);
    expect(r.byEmployee).toEqual([
      { employeeId: "e1", employeeName: "María", totalHours: 15.5, avgTipPercent: 100, totalAmount: 153_000 },
      { employeeId: "e2", employeeName: "Juan", totalHours: 8, avgTipPercent: 50, totalAmount: 36_000 },
    ]);
  });

  it("la suma asignada por empleado coincide con la suma de las distribuciones", () => {
    const r = aggregateTipsReport(ENTRIES);
    const asignado = r.byEmployee.reduce((s, e) => s + e.totalAmount, 0);
    const distribuido = ENTRIES.flatMap((e) => e.distributions).reduce((s, d) => s + d.amount, 0);
    expect(asignado).toBe(distribuido);
  });

  it("promedia el % con peso de horas (8h al 100% + 8h al 50% = 75%)", () => {
    const r = aggregateTipsReport([
      { date: "2026-09-01", totalAmount: 0, menaje: 0, netAmount: 0, notes: null, distributions: [dist("e1", "Ana", 8, 100, 10)] },
      { date: "2026-09-02", totalAmount: 0, menaje: 0, netAmount: 0, notes: null, distributions: [dist("e1", "Ana", 8, 50, 10)] },
    ]);
    expect(r.byEmployee[0].avgTipPercent).toBe(75);
  });

  it("ordena el detalle por fecha ascendente y calcula propina por hora", () => {
    const r = aggregateTipsReport(ENTRIES);
    expect(r.byDay.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    const d1 = r.byDay[0];
    expect(d1).toMatchObject({ gross: 120_000, menaje: 12_000, distributed: 108_000, notes: "Evento privado" });
    expect(d1.rows[0]).toEqual({ employeeName: "María", hoursWorked: 8, tipPercent: 100, effectiveHours: 8, ratePerHour: 9_000, amount: 72_000 });
    expect(d1.rows[1]).toMatchObject({ employeeName: "Juan", effectiveHours: 4, ratePerHour: 9_000 });
  });

  it("día sin reparto queda con rows vacío", () => {
    const r = aggregateTipsReport(ENTRIES);
    expect(r.byDay[2].rows).toEqual([]);
  });

  it("propina por hora es 0 si las horas efectivas son 0", () => {
    const r = aggregateTipsReport([
      { date: "2026-09-01", totalAmount: 0, menaje: 0, netAmount: 0, notes: null, distributions: [{ ...dist("e1", "Ana", 5, 0, 0), effectiveHours: 0 }] },
    ]);
    expect(r.byDay[0].rows[0].ratePerHour).toBe(0);
  });

  it("sin registros devuelve todo en cero", () => {
    expect(aggregateTipsReport([])).toEqual({ totals: { gross: 0, menaje: 0, distributed: 0 }, byEmployee: [], byDay: [] });
  });
});

describe("parseTipsReportRange", () => {
  const p = (q: string) => parseTipsReportRange(new URLSearchParams(q));

  it("acepta un rango válido", () => {
    expect(p("from=2026-09-01&to=2026-09-15")).toEqual({ ok: true, from: "2026-09-01", to: "2026-09-15" });
  });

  it("acepta from igual a to", () => {
    expect(p("from=2026-09-01&to=2026-09-01")).toMatchObject({ ok: true });
  });

  it("rechaza fechas faltantes", () => {
    expect(p("from=2026-09-01")).toEqual({ ok: false, error: "Debes indicar las fechas Desde y Hasta" });
  });

  it("rechaza formato inválido", () => {
    expect(p("from=01/09/2026&to=2026-09-15")).toEqual({ ok: false, error: "Formato de fecha inválido (usa AAAA-MM-DD)" });
  });

  it("rechaza from posterior a to", () => {
    expect(p("from=2026-09-16&to=2026-09-15")).toEqual({ ok: false, error: "La fecha Desde no puede ser posterior a Hasta" });
  });
});
