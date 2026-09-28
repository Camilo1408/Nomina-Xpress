import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { TipsPDF } from "../tips-template";
import { aggregateTipsReport } from "@/lib/tips-report";

describe("PDF de propinas", () => {
  it("genera un PDF válido con asignación y detalle", async () => {
    const report = aggregateTipsReport([
      {
        date: "2026-09-01", totalAmount: 120_000, menaje: 12_000, netAmount: 108_000, notes: "Evento",
        distributions: [
          { employeeId: "e1", hoursWorked: 8, tipPercent: 100, effectiveHours: 8, amount: 72_000, employee: { name: "María" } },
          { employeeId: "e2", hoursWorked: 8, tipPercent: 50, effectiveHours: 4, amount: 36_000, employee: { name: "Juan" } },
        ],
      },
      { date: "2026-09-02", totalAmount: 10_000, menaje: 1_000, netAmount: 9_000, notes: null, distributions: [] },
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
