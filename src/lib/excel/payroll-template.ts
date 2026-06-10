import ExcelJS from "exceljs";
import type { PayrollResult } from "@/lib/payroll";
import { formatHours } from "@/lib/utils";
import type { LoadedLogo } from "@/lib/logo-loader";

type PayrollWithTips = PayrollResult & {
  totalTips: number;
  netPayWithTips: number;
};

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
    { key: "total", width: 18 },
  ];

  // Altura fila 1 = encabezado con logo. Logo cuadrado 64x64 para mantener simetría.
  const LOGO_SIZE = 64;
  summary.getRow(1).height = 56;

  // Logo (esquina sup. derecha del encabezado): cuadrado fijo, posicionado en última columna (H).
  if (logo) {
    const ext = logo.format === "jpg" ? "jpeg" : "png";
    // ExcelJS espera Buffer pero define tipo restringido; cast seguro.
    const imageId = workbook.addImage({ buffer: logo.data as unknown as ExcelJS.Buffer, extension: ext });
    summary.addImage(imageId, {
      tl: { col: 7.05, row: 0.05 }, // col 7 = H (base 0); offset pequeño para no pegarse al borde
      ext: { width: LOGO_SIZE, height: LOGO_SIZE },
      editAs: "oneCell",
    });
  }

  // Título (merge sobre las primeras 7 columnas para no tapar logo)
  summary.mergeCells("A1:G1");
  const titleCell = summary.getCell("A1");
  titleCell.value = `${tenantName} — ${reportTitle} ${data.period.from} al ${data.period.to}`;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } };
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFAF7F2" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const headers = ["Empleado", "Horas Normales", "Horas Especiales", "Bruto", "Ajustes", "Neto", "Propinas", "Total Final"];
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
      emp.netPayWithTips,
    ]);
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9F5F0" } };
      });
    }
    ["D", "E", "F", "G", "H"].forEach((col) => {
      const cell = row.getCell(col);
      cell.numFmt = '"$"#,##0';
    });

    // Fila de firma debajo del empleado
    const sigRow = summary.addRow([
      `Firma del empleado: ______________________________`,
      "", "", "", "", "", "", "",
    ]);
    summary.mergeCells(`A${sigRow.number}:H${sigRow.number}`);
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
      total: acc.total + e.netPayWithTips,
    }),
    { gross: 0, adj: 0, net: 0, tips: 0, total: 0 }
  );
  const totalRow = summary.addRow(["TOTAL", "", "", totals.gross, totals.adj, totals.net, totals.tips, totals.total]);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2EDE6" } };
  });
  ["D", "E", "F", "G", "H"].forEach((col) => {
    totalRow.getCell(col).numFmt = '"$"#,##0';
  });

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

  const detailHeaders = ["Empleado", "Fecha", "Entrada", "Salida", "Horas", "Tipo", "Notas"];
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
