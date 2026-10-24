import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generateTipsExcel } from "../tips-template";
import { aggregateTipsReport } from "@/lib/tips-report";
import { formatCurrency } from "@/lib/utils";

const REPORT = aggregateTipsReport([
  {
    date: "2026-09-01", totalAmount: 120_000, menaje: 12_000, contestReserved: 0, netAmount: 108_000, notes: null,
    distributions: [
      { employeeId: "e1", hoursWorked: 8, tipPercent: 100, effectiveHours: 8, amount: 72_000, employee: { name: "María" } },
      { employeeId: "e2", hoursWorked: 8, tipPercent: 50, effectiveHours: 4, amount: 36_000, employee: { name: "Juan" } },
    ],
  },
  { date: "2026-09-02", totalAmount: 10_000, menaje: 1_000, contestReserved: 0, netAmount: 9_000, notes: null, distributions: [] },
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

describe("Excel de propinas — concursos", () => {
  const WITH_CONTEST = aggregateTipsReport(
    [
      {
        date: "2026-07-01", totalAmount: 100_000, menaje: 10_000, contestReserved: 2_000, netAmount: 88_000, notes: null,
        distributions: [{ employeeId: "e1", hoursWorked: 8, tipPercent: 100, effectiveHours: 8, amount: 88_000, employee: { name: "María" } }],
      },
    ],
    [
      {
        id: "c1", name: "Incentivo de julio", startDate: "2026-07-01", endDate: "2026-07-31", status: "FINALIZADO", payoutMode: "UNICO",
        items: [
          {
            name: "Venta de vinos", goalValue: 20, goalUnit: "botellas", percent: 2.5, outcome: "ADJUDICADO",
            reserves: [{ amount: 2_000 }],
            bonuses: [
              {
                resultValue: 24, totalAmount: 2_000, status: "PENDIENTE", employee: { name: "Juan" },
                payments: [{ installment: 1, periodStart: "2026-08-01", periodEnd: "2026-08-15", amount: 2_000, status: "PENDIENTE" }],
              },
            ],
          },
        ],
      },
    ]
  );

  async function loadWithContest() {
    const buffer = await generateTipsExcel(WITH_CONTEST, { from: "2026-07-01", to: "2026-07-31" }, "Cucina dei Fiori", "#C1643F", null);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb;
  }

  it("sin concursos no hay hoja Concursos ni fila de reservado", async () => {
    const wb = await load();
    expect(wb.getWorksheet("Concursos")).toBeUndefined();
    expect(text(wb.getWorksheet("Asignación")!)).not.toContain("Reservado a concursos");
  });

  it("con un concurso cerrado agrega la hoja Concursos entre Asignación y el detalle", async () => {
    const wb = await loadWithContest();
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Asignación", "Concursos", "Detalle por día"]);
  });

  it("los totales muestran lo reservado a concursos y cuadran con el bruto", async () => {
    const ws = (await loadWithContest()).getWorksheet("Asignación")!;
    const val = (label: string) => rows(ws).find((r) => r.getCell(1).value === label)!.getCell(2).value as number;
    expect(val("Reservado a concursos")).toBe(2_000);
    expect(val("Total propinas brutas")).toBe(
      val("Provisión menaje (10%)") + val("Reservado a concursos") + val("Total distribuido")
    );
  });

  it("la hoja Concursos lista el concurso, sus ítems y a quién se otorgó con su quincena de pago", async () => {
    const ws = (await loadWithContest()).getWorksheet("Concursos")!;
    const t = text(ws);
    expect(ws.getCell("A1").value).toBe("Cucina dei Fiori — Distribución de concursos 2026-07-01 al 2026-07-31");
    expect(t).toContain("Incentivo de julio — 01/07/2026 al 31/07/2026 · Finalizado");
    const item = rows(ws).find((r) => r.getCell(1).value === "Venta de vinos")!;
    expect(item.getCell(3).value).toBe(2.5);
    expect(item.getCell(5).value).toBe("Adjudicado");
    const juan = rows(ws).find((r) => r.getCell(1).value === "Juan")!;
    expect(juan.getCell(4).value).toBe(2_000);
    expect(juan.getCell(5).value).toBe("01 al 15/08/2026: " + formatCurrency(2_000) + " · Pendiente");
    expect(rows(ws).find((r) => r.getCell(1).value === "TOTAL OTORGADO")!.getCell(4).value).toBe(2_000);
  });

  it("el día con reserva muestra la parte de concursos en su encabezado", async () => {
    const t = text((await loadWithContest()).getWorksheet("Detalle por día")!);
    expect(t.find((s) => s.startsWith("01/07/2026"))).toContain("| Concursos");
  });
});
