import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PayrollResult } from "@/lib/payroll";
import { formatCurrency, formatHours } from "@/lib/utils";

type PayrollWithTips = PayrollResult & { totalTips: number; netPayWithTips: number };

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#2C1F15" },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 11, color: "#7A6358" },
  section: { marginBottom: 16 },
  employeeName: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 6, color: "#C1643F" },
  table: { border: 1, borderColor: "#E0D5CA", borderRadius: 4 },
  tableHeader: { flexDirection: "row", backgroundColor: "#F2EDE6", padding: "6 8" },
  tableRow: { flexDirection: "row", padding: "5 8", borderTop: 1, borderColor: "#E0D5CA" },
  tableRowAlt: { flexDirection: "row", padding: "5 8", borderTop: 1, borderColor: "#E0D5CA", backgroundColor: "#FDFAF7" },
  col1: { flex: 3 },
  col2: { flex: 2, textAlign: "right" },
  col3: { flex: 2, textAlign: "right" },
  col4: { flex: 2, textAlign: "right" },
  headerText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#7A6358" },
  totalRow: { flexDirection: "row", padding: "6 8", borderTop: 2, borderColor: "#2C1F15", backgroundColor: "#F2EDE6" },
  totalLabel: { flex: 5, fontFamily: "Helvetica-Bold", fontSize: 11 },
  totalValue: { flex: 2, fontFamily: "Helvetica-Bold", fontSize: 11, textAlign: "right" },
  netPay: { color: "#6B8E6B" },
  adjustmentRow: { flexDirection: "row", padding: "3 8", borderTop: 1, borderColor: "#F2EDE6" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, borderTop: 1, borderColor: "#E0D5CA", paddingTop: 6 },
  footerText: { fontSize: 8, color: "#A08878", textAlign: "center" },
  divider: { borderBottom: 1, borderColor: "#E0D5CA", marginVertical: 12 },
  summaryLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  summaryLabel: { color: "#7A6358" },
  summaryValue: { fontFamily: "Helvetica-Bold" },
});

interface PayrollPDFProps {
  tenantName: string;
  period: { from: string; to: string };
  employees: PayrollWithTips[];
  primaryColor: string;
}

export function PayrollPDF({ tenantName, period, employees, primaryColor }: PayrollPDFProps) {
  const totalGross = employees.reduce((s, e) => s + e.grossPay, 0);
  const totalTips = employees.reduce((s, e) => s + e.totalTips, 0);
  const totalNet = employees.reduce((s, e) => s + e.netPayWithTips, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: primaryColor }]}>{tenantName}</Text>
          <Text style={styles.subtitle}>Reporte de Nómina — {period.from} al {period.to}</Text>
        </View>

        {employees.map((emp) => (
          <View key={emp.employeeId} style={styles.section} wrap={false}>
            <Text style={styles.employeeName}>{emp.employeeName}</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.col1, styles.headerText]}>Concepto</Text>
                <Text style={[styles.col2, styles.headerText]}>Horas</Text>
                <Text style={[styles.col3, styles.headerText]}>Tarifa/h</Text>
                <Text style={[styles.col4, styles.headerText]}>Subtotal</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.col1}>Horas normales</Text>
                <Text style={styles.col2}>{formatHours(emp.normalHours)}</Text>
                <Text style={styles.col3}>{formatCurrency(emp.hourlyRateNormal)}</Text>
                <Text style={styles.col4}>{formatCurrency(emp.normalHours * emp.hourlyRateNormal)}</Text>
              </View>
              {emp.specialHours > 0 && (
                <View style={styles.tableRowAlt}>
                  <Text style={styles.col1}>Horas especiales (Dom/Fest)</Text>
                  <Text style={styles.col2}>{formatHours(emp.specialHours)}</Text>
                  <Text style={styles.col3}>{formatCurrency(emp.hourlyRateSpecial)}</Text>
                  <Text style={styles.col4}>{formatCurrency(emp.specialHours * emp.hourlyRateSpecial)}</Text>
                </View>
              )}
              {emp.adjustments.map((adj, i) => (
                <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={styles.col1}>{adj.description}</Text>
                  <Text style={styles.col2}></Text>
                  <Text style={styles.col3}>{adj.type === "BONUS" ? "Bono" : "Descuento"}</Text>
                  <Text style={[styles.col4, { color: adj.type === "BONUS" ? "#6B8E6B" : "#B94040" }]}>
                    {adj.type === "BONUS" ? "+" : "-"}{formatCurrency(adj.amount)}
                  </Text>
                </View>
              ))}
              {emp.totalTips > 0 && (
                <View style={styles.tableRow}>
                  <Text style={styles.col1}>Propinas del período</Text>
                  <Text style={styles.col2}></Text>
                  <Text style={styles.col3}></Text>
                  <Text style={[styles.col4, { color: "#C1643F" }]}>+{formatCurrency(emp.totalTips)}</Text>
                </View>
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL NETO</Text>
                <Text style={[styles.totalValue, styles.netPay]}>{formatCurrency(emp.netPayWithTips)}</Text>
              </View>
            </View>
          </View>
        ))}

        <View style={styles.divider} />
        <View style={[styles.summaryLine, { marginTop: 4 }]}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>Total bruto del período</Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{formatCurrency(totalGross)}</Text>
        </View>
        {totalTips > 0 && (
          <View style={styles.summaryLine}>
            <Text style={{ color: "#C1643F", fontFamily: "Helvetica-Bold" }}>Total propinas del período</Text>
            <Text style={{ color: "#C1643F", fontFamily: "Helvetica-Bold" }}>{formatCurrency(totalTips)}</Text>
          </View>
        )}
        <View style={styles.summaryLine}>
          <Text style={[{ fontFamily: "Helvetica-Bold" }, styles.netPay]}>Total neto del período</Text>
          <Text style={[{ fontFamily: "Helvetica-Bold", fontSize: 13 }, styles.netPay]}>{formatCurrency(totalNet)}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generado el {new Date().toLocaleDateString("es-CO")} — Nómina Xpress
          </Text>
        </View>
      </Page>
    </Document>
  );
}
