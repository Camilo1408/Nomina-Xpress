import ExcelJS from "exceljs";
import { formatHours, formatCurrency } from "@/lib/utils";
import type { LoadedLogo } from "@/lib/logo-loader";
import type { PayrollWithExtras } from "@/lib/report-types";

type PayrollWithTips = PayrollWithExtras;

export type ExcelReportType = "payroll" | "shifts";

const REPORT_TITLES: Record<ExcelReportType, string> = {
  payroll: "Reporte de Nómina",
  shifts: "Reporte de Turnos",
};

export async function generatePayrollExcel(
  data: { period: { from: string; to: string }; employees: PayrollWithTips[] },
  tenantName: string,
  primaryColor: string,
  reportType: ExcelReportType = "payroll",
  logo?: LoadedLogo | null
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const hex = primaryColor.replace("#", "");
  const reportTitle = REPORT_TITLES[reportType];

  // Summary sheet
  const summary = workbook.addWorksheet("Resumen");
  summary.columns = [
    { key: "name", width: 28 },
    { key: "normalH", width: 14 },
    { key: "specialH", width: 14 },
    { key: "gross", width: 18 },
    { key: "adjustments", width: 18 },
    { key: "net", width: 18 },
    { key: "tips", width: 18 },
    { key: "bonuses", width: 16 },
    { key: "discounts", width: 16 },
    { key: "total", width: 18 },
  ];

  // Altura fila 1 = encabezado con logo. Logo cuadrado 64x64 para mantener simetría.
  const LOGO_SIZE = 64;
  summary.getRow(1).height = 56;

  // Logo (esquina sup. derecha del encabezado): cuadrado fijo, posicionado en última columna (J).
  if (logo) {
    const ext = logo.format === "jpg" ? "jpeg" : "png";
    // ExcelJS espera Buffer pero define tipo restringido; cast seguro.
    const imageId = workbook.addImage({ buffer: logo.data as unknown as ExcelJS.Buffer, extension: ext });
    summary.addImage(imageId, {
      tl: { col: 9.05, row: 0.05 }, // col 9 = J (base 0); offset pequeño para no pegarse al borde
      ext: { width: LOGO_SIZE, height: LOGO_SIZE },
      editAs: "oneCell",
    });
  }

  // Título (merge sobre las primeras 9 columnas para no tapar logo)
  summary.mergeCells("A1:I1");
  const titleCell = summary.getCell("A1");
  titleCell.value = `${tenantName} — ${reportTitle} ${data.period.from} al ${data.period.to}`;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } };
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFAF7F2" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const headers = ["Personal", "Horas Normales", "Horas Especiales", "Bruto", "Ajustes", "Neto", "Propinas *", "Bonos", "Descuentos", "Total Final"];
  const headerRow = summary.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2EDE6" } };
    cell.font = { bold: true, color: { argb: "FF2C1F15" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE0D5CA" } } };
    cell.alignment = { horizontal: "center" };
  });

  data.employees.forEach((emp, i) => {
    const row = summary.addRow([
      emp.employeeName,
      formatHours(emp.normalHours),
      formatHours(emp.specialHours),
      emp.grossPay,
      emp.totalAdjustments,
      emp.netPay,
      emp.totalTips,
      emp.totalBonuses,
      emp.totalDiscounts,
      emp.finalPay,
    ]);
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9F5F0" } };
      });
    }
    ["D", "E", "F", "G", "H", "I", "J"].forEach((col) => {
      const cell = row.getCell(col);
      cell.numFmt = '"$"#,##0';
    });

    // Detalle de bonos aplicados (una fila por bono): solo concepto + valor
    emp.bonuses.forEach((b) => {
      const detailText = `   • Bono: ${b.name}: +${formatCurrency(b.appliedAmount)}`;
      const bRow = summary.addRow([detailText, "", "", "", "", "", "", "", "", ""]);
      summary.mergeCells(`A${bRow.number}:J${bRow.number}`);
      const bCell = bRow.getCell(1);
      bCell.font = { color: { argb: "FF6B8E6B" }, size: 9 };
      bCell.alignment = { horizontal: "left", vertical: "middle" };
    });

    // Detalle de descuentos aplicados (una fila por descuento): solo concepto + valor
    emp.discounts.forEach((d) => {
      const detailText = `   • Descuento: ${d.name}: −${formatCurrency(d.appliedAmount)}`;
      const dRow = summary.addRow([detailText, "", "", "", "", "", "", "", "", ""]);
      summary.mergeCells(`A${dRow.number}:J${dRow.number}`);
      const dCell = dRow.getCell(1);
      dCell.font = { color: { argb: "FFB94040" }, size: 9 };
      dCell.alignment = { horizontal: "left", vertical: "middle" };
    });

    // Fila de firma debajo del personal
    const sigLabel = reportType === "shifts" ? "Firma del contratista" : "Firma del personal";
    const sigRow = summary.addRow([
      `${sigLabel}: ______________________________`,
      "", "", "", "", "", "", "", "", "",
    ]);
    summary.mergeCells(`A${sigRow.number}:J${sigRow.number}`);
    const sigCell = sigRow.getCell(1);
    sigCell.font = { italic: true, color: { argb: "FF7A6358" }, size: 10 };
    sigCell.alignment = { horizontal: "left", vertical: "middle" };
    sigRow.height = 22;
  });

  // Totals
  const totals = data.employees.reduce(
    (acc, e) => ({
      gross: acc.gross + e.grossPay,
      adj: acc.adj + e.totalAdjustments,
      net: acc.net + e.netPay,
      tips: acc.tips + e.totalTips,
      bonuses: acc.bonuses + e.totalBonuses,
      discounts: acc.discounts + e.totalDiscounts,
      total: acc.total + e.finalPay,
    }),
    { gross: 0, adj: 0, net: 0, tips: 0, bonuses: 0, discounts: 0, total: 0 }
  );
  const totalRow = summary.addRow(["TOTAL", "", "", totals.gross, totals.adj, totals.net, totals.tips, totals.bonuses, totals.discounts, totals.total]);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2EDE6" } };
  });
  ["D", "E", "F", "G", "H", "I", "J"].forEach((col) => {
    totalRow.getCell(col).numFmt = '"$"#,##0';
  });

  // Nota informativa sobre propinas
  const noteRow = summary.addRow(["* Las propinas se muestran como valor informativo y no se suman al Total Final.", "", "", "", "", "", "", "", "", ""]);
  summary.mergeCells(`A${noteRow.number}:J${noteRow.number}`);
  noteRow.getCell(1).font = { italic: true, color: { argb: "FF7A6358" }, size: 9 };
  noteRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

  // Detail sheet
  const detail = workbook.addWorksheet("Detalle");
  detail.columns = [
    { key: "employee", width: 24 },
    { key: "date", width: 14 },
    { key: "checkIn", width: 12 },
    { key: "checkOut", width: 12 },
    { key: "hours", width: 10 },
    { key: "type", width: 12 },
    { key: "notes", width: 28 },
  ];

  const detailHeaders = ["Personal", "Fecha", "Entrada", "Salida", "Horas", "Tipo", "Notas"];
  const dHeaderRow = detail.addRow(detailHeaders);
  dHeaderRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2EDE6" } };
    cell.font = { bold: true, color: { argb: "FF2C1F15" } };
    cell.alignment = { horizontal: "center" };
  });

  data.employees.forEach((emp) => {
    emp.entries.forEach((entry, i) => {
      const hours = entry.checkOut
        ? Math.max(0, (new Date(entry.checkOut).getTime() - new Date(entry.checkIn).getTime()) / 3600000)
        : 0;
      const row = detail.addRow([
        emp.employeeName,
        entry.date,
        new Date(entry.checkIn).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
        entry.checkOut ? new Date(entry.checkOut).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "—",
        formatHours(hours),
        entry.isSpecial ? "Especial" : "Normal",
        entry.notes ?? "",
      ]);
      if (i % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9F5F0" } };
        });
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
