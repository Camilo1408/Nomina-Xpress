import ExcelJS from "exceljs";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { LoadedLogo } from "@/lib/logo-loader";
import type { TipsReport } from "@/lib/tips-report";

const MONEY = '"$"#,##0';
const HOURS = '0.00"h"';
const PCT = '0"%"';
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2EDE6" } };
const ALT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9F5F0" } };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: "FF2C1F15" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE0D5CA" } } };
    cell.alignment = { horizontal: "center" };
  });
}

export async function generateTipsExcel(
  report: TipsReport,
  period: { from: string; to: string },
  tenantName: string,
  primaryColor: string,
  logo?: LoadedLogo | null
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const hex = primaryColor.replace("#", "");

  // ── Hoja 1: Asignación ────────────────────────────────────────────────────
  const ws = workbook.addWorksheet("Asignación");
  ws.columns = [
    { key: "name", width: 28 },
    { key: "hours", width: 16 },
    { key: "pct", width: 14 },
    { key: "total", width: 18 },
    { key: "sign", width: 34 },
  ];

  const LOGO_SIZE = 64;
  ws.getRow(1).height = 56;
  if (logo) {
    const ext = logo.format === "jpg" ? "jpeg" : "png";
    const imageId = workbook.addImage({ buffer: logo.data as unknown as ExcelJS.Buffer, extension: ext });
    ws.addImage(imageId, {
      tl: { col: 4.05, row: 0.05 }, // col 4 = E (base 0)
      ext: { width: LOGO_SIZE, height: LOGO_SIZE },
      editAs: "oneCell",
    });
  }

  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `${tenantName} — Reporte de Propinas ${period.from} al ${period.to}`;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } };
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFAF7F2" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const totalsRows: [string, number, string][] = [
    ["Total propinas brutas", report.totals.gross, "FF2C1F15"],
    ["Provisión menaje (10%)", report.totals.menaje, "FFB94040"],
    ["Total distribuido", report.totals.distributed, "FF6B8E6B"],
  ];
  for (const [label, value, color] of totalsRows) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true, color: { argb: "FF7A6358" } };
    row.getCell(2).numFmt = MONEY;
    row.getCell(2).font = { bold: true, color: { argb: color } };
  }
  ws.addRow([]);

  styleHeader(ws.addRow(["Personal", "Horas trabajadas", "% Asignación", "Total recibido", "Firma del personal"]));

  report.byEmployee.forEach((emp, i) => {
    const row = ws.addRow([emp.employeeName, emp.totalHours, emp.avgTipPercent, emp.totalAmount, "______________________________"]);
    row.height = 24;
    row.getCell(2).numFmt = HOURS;
    row.getCell(3).numFmt = PCT;
    row.getCell(4).numFmt = MONEY;
    row.getCell(4).font = { bold: true, color: { argb: "FF6B8E6B" } };
    row.getCell(5).font = { color: { argb: "FF7A6358" } };
    row.alignment = { vertical: "bottom" };
    if (i % 2 === 1) row.eachCell((cell) => { cell.fill = ALT_FILL; });
  });

  if (report.byEmployee.length === 0) {
    const empty = ws.addRow(["No hay propinas registradas en este período."]);
    ws.mergeCells(`A${empty.number}:E${empty.number}`);
    empty.getCell(1).font = { italic: true, color: { argb: "FF7A6358" } };
  }

  const assigned = report.byEmployee.reduce((s, e) => s + e.totalAmount, 0);
  const totalRow = ws.addRow(["TOTAL ASIGNADO", "", "", assigned, ""]);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });
  totalRow.getCell(4).numFmt = MONEY;

  // ── Hoja 2: Detalle por día ───────────────────────────────────────────────
  const detail = workbook.addWorksheet("Detalle por día");
  detail.columns = [
    { key: "name", width: 28 },
    { key: "hours", width: 12 },
    { key: "pct", width: 12 },
    { key: "eff", width: 12 },
    { key: "rate", width: 14 },
    { key: "amount", width: 16 },
  ];

  if (report.byDay.length === 0) {
    const empty = detail.addRow(["No hay propinas registradas en este período."]);
    detail.mergeCells(`A${empty.number}:F${empty.number}`);
    empty.getCell(1).font = { italic: true, color: { argb: "FF7A6358" } };
  }

  for (const day of report.byDay) {
    const titleText =
      `${formatDate(day.date)} — Bruto ${formatCurrency(day.gross)} | ` +
      `Menaje ${formatCurrency(day.menaje)} | Distribuido ${formatCurrency(day.distributed)}` +
      (day.notes ? ` — ${day.notes}` : "");
    const dayRow = detail.addRow([titleText]);
    detail.mergeCells(`A${dayRow.number}:F${dayRow.number}`);
    dayRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } };
    dayRow.getCell(1).font = { bold: true, color: { argb: "FFFAF7F2" } };

    if (day.rows.length === 0) {
      const empty = detail.addRow(["Sin horas registradas ese día — no se distribuyó"]);
      detail.mergeCells(`A${empty.number}:F${empty.number}`);
      empty.getCell(1).font = { italic: true, color: { argb: "FF7A6358" } };
    } else {
      styleHeader(detail.addRow(["Personal", "Horas", "% Prop.", "Hs. ef.", "Prop./h", "Propina"]));
      day.rows.forEach((r, i) => {
        const row = detail.addRow([r.employeeName, r.hoursWorked, r.tipPercent, r.effectiveHours, r.ratePerHour, r.amount]);
        row.getCell(2).numFmt = HOURS;
        row.getCell(3).numFmt = PCT;
        row.getCell(4).numFmt = HOURS;
        row.getCell(5).numFmt = MONEY;
        row.getCell(6).numFmt = MONEY;
        row.getCell(6).font = { bold: true, color: { argb: "FF6B8E6B" } };
        if (i % 2 === 1) row.eachCell((cell) => { cell.fill = ALT_FILL; });
      });
    }
    detail.addRow([]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
