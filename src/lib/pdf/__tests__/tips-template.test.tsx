import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { TipsPDF } from "../tips-template";
import { aggregateTipsReport } from "@/lib/tips-report";

describe("PDF de propinas", () => {
  it("genera un PDF válido con asignación y detalle", async () => {
    const report = aggregateTipsReport([
      {
        date: "2026-09-01", totalAmount: 120_000, menaje: 12_000, contestReserved: 0, netAmount: 108_000, notes: "Evento",
        distributions: [
          { employeeId: "e1", hoursWorked: 8, tipPercent: 100, effectiveHours: 8, amount: 72_000, employee: { name: "María" } },
          { employeeId: "e2", hoursWorked: 8, tipPercent: 50, effectiveHours: 4, amount: 36_000, employee: { name: "Juan" } },
        ],
      },
      { date: "2026-09-02", totalAmount: 10_000, menaje: 1_000, contestReserved: 0, netAmount: 9_000, notes: null, distributions: [] },
    ]);
    const buffer = await renderToBuffer(
      TipsPDF({ tenantName: "Cucina dei Fiori", period: { from: "2026-09-01", to: "2026-09-15" }, report, primaryColor: "#C1643F", logo: null })
    );
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("genera un PDF aunque no haya registros", async () => {
    const buffer = await renderToBuffer(
      TipsPDF({ tenantName: "X", period: { from: "2026-09-01", to: "2026-09-15" }, report: aggregateTipsReport([]), primaryColor: "#C1643F" })
    );
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("PDF de propinas — concursos", () => {
  const report = aggregateTipsReport(
    [{ date: "2026-07-01", totalAmount: 100_000, menaje: 10_000, contestReserved: 2_000, netAmount: 88_000, notes: null, distributions: [] }],
    [
      {
        id: "c1", name: "Incentivo de julio", startDate: "2026-07-01", endDate: "2026-07-31", status: "PAGADO", payoutMode: "DIVIDIDO",
        items: [
          {
            name: "Venta de vinos", goalValue: 20, goalUnit: "botellas", percent: 2, outcome: "ADJUDICADO",
            reserves: [{ amount: 2_000 }],
            bonuses: [
              {
                resultValue: 24, totalAmount: 2_000, status: "PAGADO", employee: { name: "Juan" },
                payments: [
                  { installment: 1, periodStart: "2026-08-01", periodEnd: "2026-08-15", amount: 1_000, status: "PAGADO" },
                  { installment: 2, periodStart: "2026-08-16", periodEnd: "2026-08-31", amount: 1_000, status: "PAGADO" },
                ],
              },
            ],
          },
          { name: "Postres", goalValue: 50, goalUnit: "unidades", percent: 1, outcome: "DESIERTO", reserves: [], bonuses: [] },
        ],
      },
    ]
  );

  const pageCount = (buffer: Buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  it("agrega una página de distribución de concursos solo cuando hay concursos", async () => {
    const period = { from: "2026-07-01", to: "2026-07-31" };
    const withContest = await renderToBuffer(TipsPDF({ tenantName: "X", period, report, primaryColor: "#C1643F" }));
    const without = await renderToBuffer(
      TipsPDF({ tenantName: "X", period, report: { ...report, contests: [] }, primaryColor: "#C1643F" })
    );
    expect(withContest.subarray(0, 4).toString()).toBe("%PDF");
    expect(pageCount(withContest)).toBe(pageCount(without) + 1);
  });
});
