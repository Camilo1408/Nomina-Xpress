// El Excel dice al pie que las propinas NO se suman al Total Final: esta prueba
// abre el archivo generado y comprueba que la columna Total Final lo cumple.

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generatePayrollExcel } from "../payroll-template";
import type { PayrollWithExtras } from "@/lib/report-types";

const EMPLEADO: PayrollWithExtras = {
  employeeId: "e1",
  employeeName: "Claudia",
  normalHours: 80.13,
  specialHours: 32.4,
  hourlyRateNormal: 6471,
  hourlyRateSpecial: 12024,
  grossPay: 908_120,
  adjustments: [
    { id: "a1", type: "DISCOUNT", amount: 10_225, description: "ALBONDIGAS", periodStart: "2026-07-01", periodEnd: "2026-07-15" },
    { id: "a2", type: "DISCOUNT", amount: 7_000, description: "COMIDA", periodStart: "2026-07-01", periodEnd: "2026-07-15" },
  ],
  totalAdjustments: -17_225,
  netPay: 890_895,
  entries: [],
  totalTips: 298_443,
  netPayWithTips: 1_189_338,
  bonuses: [
    { bonusId: "b1", name: "Bono Quincenal", description: null, frequency: "BIWEEKLY", monthlyMode: null, valueType: "STANDARD", configuredAmount: 394_800, appliedAmount: 394_800, periodsCount: 1 },
  ],
  totalBonuses: 394_800,
  discounts: [
    { discountId: "d1", name: "Pension", description: null, frequency: "BIWEEKLY", monthlyMode: null, valueType: "STANDARD", configuredAmount: 28_470, appliedAmount: 28_470, periodsCount: 1 },
  ],
  totalDiscounts: 28_470,
  finalPay: 1_257_225,
};

async function buildSheet() {
  const buffer = await generatePayrollExcel(
    { period: { from: "2026-07-01", to: "2026-07-15" }, employees: [EMPLEADO] },
    "Cucina dei Fiori",
    "#C1643F",
    "payroll",
    null
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

describe("Excel de nómina — columna Total Final", () => {
  it("Bruto + Ajustes = Neto, y Total Final = Neto + Bonos − Descuentos (sin propinas)", async () => {
    const sheet = await buildSheet();
    const row = sheet.getRows(1, sheet.rowCount)!.find((r) => r.getCell(1).value === "Claudia")!;
    const bruto = row.getCell(4).value as number;
    const ajustes = row.getCell(5).value as number;
    const neto = row.getCell(6).value as number;
    const propinas = row.getCell(7).value as number;
    const bonos = row.getCell(8).value as number;
    const descuentos = row.getCell(9).value as number;
    const total = row.getCell(10).value as number;

    expect(bruto).toBe(908_120);
    expect(ajustes).toBe(-17_225);
    expect(neto).toBe(bruto + ajustes);
    expect(propinas).toBe(298_443);
    expect(total).toBe(neto + bonos - descuentos);
    expect(total).toBe(1_257_225);
    // La comprobación que importa: el total NO incluye las propinas.
    expect(total).not.toBe(neto + propinas + bonos - descuentos);
  });

  it("la nota al pie sigue siendo cierta", async () => {
    const sheet = await buildSheet();
    const textos = sheet.getRows(1, sheet.rowCount)!.map((r) => String(r.getCell(1).value ?? ""));
    expect(textos.some((t) => t.includes("no se suman al Total Final"))).toBe(true);
  });

  it("la fila TOTAL cuadra con la suma de las filas de personal", async () => {
    const sheet = await buildSheet();
    const rows = sheet.getRows(1, sheet.rowCount)!;
    const totalRow = rows.find((r) => r.getCell(1).value === "TOTAL")!;
    expect(totalRow.getCell(10).value).toBe(1_257_225);
    expect(totalRow.getCell(4).value).toBe(908_120);
    expect(totalRow.getCell(6).value).toBe(890_895);
  });
});
