import { describe, it, expect } from "vitest";
import { aggregateTipsReport, parseTipsReportRange, type ContestInput, type TipEntryInput } from "../tips-report";

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
    menaje: 9_000, contestReserved: 0,
    netAmount: 81_000,
    notes: null,
    distributions: [dist("e1", "María", 7.5, 100, 81_000)],
  },
  {
    date: "2026-09-01",
    totalAmount: 120_000,
    menaje: 12_000, contestReserved: 0,
    netAmount: 108_000,
    notes: "Evento privado",
    distributions: [dist("e1", "María", 8, 100, 72_000), dist("e2", "Juan", 8, 50, 36_000)],
  },
  {
    date: "2026-09-03",
    totalAmount: 10_000,
    menaje: 1_000, contestReserved: 0,
    netAmount: 9_000,
    notes: null,
    distributions: [],
  },
];

describe("aggregateTipsReport", () => {
  it("suma los totales del rango", () => {
    const r = aggregateTipsReport(ENTRIES);
    expect(r.totals).toEqual({ gross: 220_000, menaje: 22_000, contestReserved: 0, distributed: 198_000 });
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
      { date: "2026-09-01", totalAmount: 0, menaje: 0, contestReserved: 0, netAmount: 0, notes: null, distributions: [dist("e1", "Ana", 8, 100, 10)] },
      { date: "2026-09-02", totalAmount: 0, menaje: 0, contestReserved: 0, netAmount: 0, notes: null, distributions: [dist("e1", "Ana", 8, 50, 10)] },
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
      { date: "2026-09-01", totalAmount: 0, menaje: 0, contestReserved: 0, netAmount: 0, notes: null, distributions: [{ ...dist("e1", "Ana", 5, 0, 0), effectiveHours: 0 }] },
    ]);
    expect(r.byDay[0].rows[0].ratePerHour).toBe(0);
  });

  it("sin registros devuelve todo en cero", () => {
    expect(aggregateTipsReport([])).toEqual({
      totals: { gross: 0, menaje: 0, contestReserved: 0, distributed: 0 },
      byEmployee: [],
      byDay: [],
      contests: [],
    });
  });
});

const CONTEST: ContestInput = {
  id: "c1",
  name: "Incentivo de julio",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  status: "FINALIZADO",
  payoutMode: "DIVIDIDO",
  items: [
    {
      name: "Venta de vinos",
      goalValue: 20,
      goalUnit: "botellas",
      percent: 2,
      outcome: "ADJUDICADO",
      reserves: [{ amount: 30_000 }, { amount: 20_001 }],
      bonuses: [
        {
          resultValue: 24,
          totalAmount: 25_001,
          status: "PARCIAL",
          employee: { name: "Juan" },
          // Desordenadas a propósito: el reporte las ordena por número de cuota.
          payments: [
            { installment: 2, periodStart: "2026-08-16", periodEnd: "2026-08-31", amount: 12_500, status: "PENDIENTE" },
            { installment: 1, periodStart: "2026-08-01", periodEnd: "2026-08-15", amount: 12_501, status: "PAGADO" },
          ],
        },
        {
          resultValue: 31,
          totalAmount: 25_000,
          status: "ANULADO",
          employee: { name: "María" },
          payments: [{ installment: 1, periodStart: "2026-08-01", periodEnd: "2026-08-15", amount: 25_000, status: "ANULADO" }],
        },
      ],
    },
    {
      name: "Postres",
      goalValue: 50,
      goalUnit: "unidades",
      percent: 1.5,
      outcome: "DESIERTO",
      reserves: [],
      bonuses: [],
    },
  ],
};

describe("aggregateTipsReport — concursos", () => {
  it("suma lo reservado a concursos y cuadra bruto = menaje + concursos + distribuido", () => {
    const r = aggregateTipsReport([
      { date: "2026-07-01", totalAmount: 100_000, menaje: 10_000, contestReserved: 2_000, netAmount: 88_000, notes: null, distributions: [] },
      { date: "2026-07-02", totalAmount: 50_000, menaje: 5_000, contestReserved: 1_000, netAmount: 44_000, notes: null, distributions: [] },
    ]);
    expect(r.totals).toEqual({ gross: 150_000, menaje: 15_000, contestReserved: 3_000, distributed: 132_000 });
    expect(r.totals.gross).toBe(r.totals.menaje + r.totals.contestReserved + r.totals.distributed);
    expect(r.byDay[0].contestReserved).toBe(2_000);
  });

  it("sin concursos el apartado queda vacío", () => {
    expect(aggregateTipsReport(ENTRIES).contests).toEqual([]);
  });

  it("resume lo reservado y lo otorgado; un bono anulado se lista pero no suma", () => {
    const [c] = aggregateTipsReport([], [CONTEST]).contests;
    expect(c).toMatchObject({
      name: "Incentivo de julio",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      statusLabel: "Finalizado",
      payoutLabel: "Dividido en las dos quincenas siguientes",
      reserved: 50_001,
      awarded: 25_001,
    });
    expect(c.winners.map((w) => [w.employeeName, w.amount, w.voided, w.statusLabel])).toEqual([
      ["Juan", 25_001, false, "Pago parcial"],
      ["María", 25_000, true, "Anulado"],
    ]);
  });

  it("cada ítem muestra su meta, lo reservado y cómo terminó", () => {
    const [c] = aggregateTipsReport([], [CONTEST]).contests;
    expect(c.items).toEqual([
      { name: "Venta de vinos", goal: "20 botellas", percent: 2, reserved: 50_001, outcomeLabel: "Adjudicado" },
      { name: "Postres", goal: "50 unidades", percent: 1.5, reserved: 0, outcomeLabel: "Desierto — devuelto al reparto" },
    ]);
  });

  it("el ganador lleva su resultado y las cuotas en orden, con la quincena en que se pagan", () => {
    const [c] = aggregateTipsReport([], [CONTEST]).contests;
    expect(c.winners[0]).toMatchObject({ itemName: "Venta de vinos", result: "24 botellas" });
    expect(c.winners[0].payments).toEqual([
      { periodStart: "2026-08-01", periodEnd: "2026-08-15", periodLabel: "01 al 15/08/2026", amount: 12_501, statusLabel: "Pagada" },
      { periodStart: "2026-08-16", periodEnd: "2026-08-31", periodLabel: "16 al 31/08/2026", amount: 12_500, statusLabel: "Pendiente" },
    ]);
  });

  it("ordena los concursos por fecha de cierre", () => {
    const early = { ...CONTEST, id: "c0", name: "Quincena 1", endDate: "2026-07-15" };
    const r = aggregateTipsReport([], [CONTEST, early]);
    expect(r.contests.map((c) => c.id)).toEqual(["c0", "c1"]);
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
