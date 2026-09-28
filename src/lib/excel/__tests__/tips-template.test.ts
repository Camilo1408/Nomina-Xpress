import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generateTipsExcel } from "../tips-template";
import { aggregateTipsReport } from "@/lib/tips-report";

const REPORT = aggregateTipsReport([
  {
    date: "2026-09-01", totalAmount: 120_000, menaje: 12_000, netAmount: 108_000, notes: null,
    distributions: [
      { employeeId: "e1", hoursWorked: 8, tipPercent: 100, effectiveHours: 8, amount: 72_000, employee: { name: "María" } },
      { employeeId: "e2", hoursWorked: 8, tipPercent: 50, effectiveHours: 4, amount: 36_000, employee: { name: "Juan" } },
    ],
  },
  { date: "2026-09-02", totalAmount: 10_000, menaje: 1_000, netAmount: 9_000, notes: null, distributions: [] },
]);

async function load() {
  const buffer = await generateTipsExcel(REPORT, { from: "2026-09-01", to: "2026-09-15" }, "Cucina dei Fiori", "#C1643F", null);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

const rows = (ws: ExcelJS.Worksheet) => ws.getRows(1, ws.rowCount) ?? [];
const text = (ws: ExcelJS.Worksheet) => rows(ws).map((r) => String(r.getCell(1).value ?? ""));

describe("Excel de propinas", () => {
  it("tiene las hojas Asignación y Detalle por día", async () => {
    const wb = await load();
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Asignación", "Detalle por día"]);
  });

  it("título con restaurante, nombre del reporte y período", async () => {
    const ws = (await load()).getWorksheet("Asignación")!;
    expect(ws.getCell("A1").value).toBe("Cucina dei Fiori — Reporte de Propinas 2026-09-01 al 2026-09-15");
  });

  it("muestra los totales del rango", async () => {
    const ws = (await load()).getWorksheet("Asignación")!;
    const val = (label: string) => rows(ws).find((r) => r.getCell(1).value === label)!.getCell(2).value;
    expect(val("Total propinas brutas")).toBe(130_000);
    expect(val("Provisión menaje (10%)")).toBe(13_000);
    expect(val("Total distribuido")).toBe(117_000);
  });

  it("una fila por empleado con total y espacio de firma; total final = suma", async () => {
    const ws = (await load()).getWorksheet("Asignación")!;
    const maria = rows(ws).find((r) => r.getCell(1).value === "María")!;
    expect(maria.getCell(4).value).toBe(72_000);
    expect(String(maria.getCell(5).value)).toContain("____");
    const header = rows(ws).find((r) => r.getCell(1).value === "Personal")!;
    expect(header.getCell(5).value).toBe("Firma del personal");
    const total = rows(ws).find((r) => r.getCell(1).value === "TOTAL ASIGNADO")!;
    expect(total.getCell(4).value).toBe(108_000);
  });

  it("reporte sin propinas: totales y total asignado en cero, con aviso en ambas hojas", async () => {
    const buffer = await generateTipsExcel(aggregateTipsReport([]), { from: "2026-09-01", to: "2026-09-15" }, "X", "#C1643F", null);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Asignación")!;
    const val = (label: string) => rows(ws).find((r) => r.getCell(1).value === label)!.getCell(2).value;
    expect(val("Total propinas brutas")).toBe(0);
    expect(val("Total distribuido")).toBe(0);
    expect(rows(ws).find((r) => r.getCell(1).value === "TOTAL ASIGNADO")!.getCell(4).value).toBe(0);
    expect(text(ws)).toContain("No hay propinas registradas en este período.");
    expect(text(wb.getWorksheet("Detalle por día")!)).toContain("No hay propinas registradas en este período.");
  });

  it("detalle agrupado por día con reparto y aviso cuando no se distribuyó", async () => {
    const ws = (await load()).getWorksheet("Detalle por día")!;
    const t = text(ws);
    expect(t.some((s) => s.startsWith("01/09/2026"))).toBe(true);
    expect(t).toContain("Juan");
    expect(t).toContain("Sin horas registradas ese día — no se distribuyó");
  });
});
