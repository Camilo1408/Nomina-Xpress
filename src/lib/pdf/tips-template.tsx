import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { TipsContest, TipsReport } from "@/lib/tips-report";
import type { PdfLogo } from "@/lib/pdf/payroll-template";

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 56, fontSize: 10, fontFamily: "Helvetica", color: "#2C1F15" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  headerLeft: { flex: 1, paddingRight: 12 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 11, color: "#7A6358" },
  logoBox: { width: 70, height: 70, alignItems: "center", justifyContent: "center" },
  logo: { maxWidth: 70, maxHeight: 70, objectFit: "contain" },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 6, marginTop: 4 },
  cards: { flexDirection: "row", gap: 8, marginBottom: 16 },
  card: { flex: 1, borderWidth: 1, borderStyle: "solid", borderColor: "#E0D5CA", borderRadius: 4, padding: 8 },
  cardLabel: { fontSize: 8, color: "#7A6358", marginBottom: 3 },
  cardValue: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  table: { borderWidth: 1, borderStyle: "solid", borderColor: "#E0D5CA", borderRadius: 4 },
  tableHeader: { flexDirection: "row", backgroundColor: "#F2EDE6", padding: "6 8" },
  tableRow: { flexDirection: "row", padding: "5 8", borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#E0D5CA" },
  tableRowAlt: { flexDirection: "row", padding: "5 8", borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#E0D5CA", backgroundColor: "#FDFAF7" },
  headerText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#7A6358" },
  totalRow: { flexDirection: "row", padding: "6 8", borderTopWidth: 2, borderTopStyle: "solid", borderTopColor: "#2C1F15", backgroundColor: "#F2EDE6" },
  bold: { fontFamily: "Helvetica-Bold" },
  green: { color: "#6B8E6B" },
  right: { textAlign: "right" },
  signatures: { marginTop: 20 },
  signatureItem: { width: "48%", marginBottom: 18 },
  signatureLine: { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "#7A6358", marginTop: 22 },
  signatureLabel: { fontSize: 9, color: "#7A6358", marginTop: 4 },
  dayBlock: { marginBottom: 12 },
  dayHeader: { padding: "6 8", borderRadius: 4, marginBottom: 4 },
  dayHeaderText: { color: "#FAF7F2", fontFamily: "Helvetica-Bold", fontSize: 10 },
  dayNotes: { color: "#FAF7F2", fontSize: 8, marginTop: 2 },
  emptyDay: { fontSize: 9, color: "#7A6358", fontFamily: "Helvetica-Oblique", padding: "4 8" },
  intro: { fontSize: 9, color: "#7A6358", marginBottom: 12 },
  contestBlock: { marginBottom: 18 },
  contestMeta: { fontSize: 9, color: "#7A6358", marginBottom: 8, paddingLeft: 2 },
  contestCards: { flexDirection: "row", gap: 8, marginBottom: 10 },
  subTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4, marginTop: 6 },
  muted: { color: "#7A6358" },
  struck: { color: "#A08878", textDecoration: "line-through" },
  paymentLine: { fontSize: 8 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#E0D5CA", paddingTop: 6 },
  footerText: { fontSize: 8, color: "#A08878", textAlign: "center" },
});

// Anchos de columnas (flex)
const A = { name: 3, hours: 2, pct: 2, total: 2 };
const D = { name: 3, hours: 1.2, pct: 1.2, eff: 1.2, rate: 1.6, amount: 1.8 };
const CI = { name: 3, goal: 2, pct: 1.2, reserved: 1.8, outcome: 2.4 };
const CW = { name: 2, item: 2.1, result: 1.4, amount: 1.4, payment: 3.6, status: 1.3 };

interface TipsPDFProps {
  tenantName: string;
  period: { from: string; to: string };
  report: TipsReport;
  primaryColor: string;
  logo?: PdfLogo;
}

function Header({ tenantName, period, primaryColor, logo }: Omit<TipsPDFProps, "report">) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        <Text style={[styles.title, { color: primaryColor }]}>{tenantName}</Text>
        <Text style={styles.subtitle}>Reporte de Propinas — {period.from} al {period.to}</Text>
      </View>
      {logo && (
        <View style={styles.logoBox}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logo} style={styles.logo} />
        </View>
      )}
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) =>
          `Generado el ${new Date().toLocaleDateString("es-CO")} — Nómina Xpress — Página ${pageNumber} de ${totalPages}`
        }
      />
    </View>
  );
}

function ContestSection({ contest, primaryColor }: { contest: TipsContest; primaryColor: string }) {
  return (
    <View style={styles.contestBlock}>
      <View style={[styles.dayHeader, { backgroundColor: primaryColor }]} wrap={false}>
        <Text style={styles.dayHeaderText}>
          {contest.name} — {formatDate(contest.startDate)} al {formatDate(contest.endDate)} · {contest.statusLabel}
        </Text>
      </View>
      <Text style={styles.contestMeta}>Pago: {contest.payoutLabel}</Text>

      <View style={styles.contestCards} wrap={false}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Reservado de las propinas</Text>
          <Text style={[styles.cardValue, { color: primaryColor }]}>{formatCurrency(contest.reserved)}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Otorgado a ganadores</Text>
          <Text style={[styles.cardValue, styles.green]}>{formatCurrency(contest.awarded)}</Text>
        </View>
      </View>

      <Text style={styles.subTitle}>Ítems del concurso</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[{ flex: CI.name }, styles.headerText]}>Ítem</Text>
          <Text style={[{ flex: CI.goal }, styles.headerText]}>Meta</Text>
          <Text style={[{ flex: CI.pct }, styles.headerText, styles.right]}>% Prop.</Text>
          <Text style={[{ flex: CI.reserved }, styles.headerText, styles.right]}>Reservado</Text>
          <Text style={[{ flex: CI.outcome }, styles.headerText, styles.right]}>Resultado</Text>
        </View>
        {contest.items.map((it, i) => (
          <View key={`${contest.id}-item-${i}`} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt} wrap={false}>
            <Text style={{ flex: CI.name }}>{it.name}</Text>
            <Text style={{ flex: CI.goal }}>{it.goal}</Text>
            <Text style={[{ flex: CI.pct }, styles.right]}>{it.percent}%</Text>
            <Text style={[{ flex: CI.reserved }, styles.right]}>{formatCurrency(it.reserved)}</Text>
            <Text style={[{ flex: CI.outcome }, styles.right, styles.muted]}>{it.outcomeLabel}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.subTitle}>Ganadores</Text>
      {contest.winners.length === 0 ? (
        <Text style={styles.emptyDay}>Aún no hay ganadores adjudicados en este concurso.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[{ flex: CW.name }, styles.headerText]}>Ganador</Text>
            <Text style={[{ flex: CW.item }, styles.headerText]}>Ítem</Text>
            <Text style={[{ flex: CW.result }, styles.headerText, styles.right]}>Resultado</Text>
            <Text style={[{ flex: CW.amount }, styles.headerText, styles.right]}>Premio</Text>
            <Text style={[{ flex: CW.payment }, styles.headerText, { paddingLeft: 8 }]}>Quincena de pago</Text>
            <Text style={[{ flex: CW.status }, styles.headerText, styles.right]}>Estado</Text>
          </View>
          {contest.winners.map((w, i) => (
            <View key={`${contest.id}-win-${i}`} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt} wrap={false}>
              <Text style={{ flex: CW.name }}>{w.employeeName}</Text>
              <Text style={{ flex: CW.item }}>{w.itemName}</Text>
              <Text style={[{ flex: CW.result }, styles.right]}>{w.result}</Text>
              <Text style={[{ flex: CW.amount }, styles.right, styles.bold, w.voided ? styles.struck : styles.green]}>
                {formatCurrency(w.amount)}
              </Text>
              <View style={{ flex: CW.payment, paddingLeft: 8 }}>
                {w.payments.map((p, j) => (
                  <Text key={j} style={styles.paymentLine}>
                    {`${p.periodLabel}: ${formatCurrency(p.amount)} · ${p.statusLabel}`}
                  </Text>
                ))}
              </View>
              <Text style={[{ flex: CW.status }, styles.right, styles.muted]}>{w.statusLabel}</Text>
            </View>
          ))}
          <View style={styles.totalRow} wrap={false}>
            <Text style={[{ flex: CW.name + CW.item + CW.result }, styles.bold]}>TOTAL OTORGADO</Text>
            <Text style={[{ flex: CW.amount }, styles.right, styles.bold, styles.green]}>{formatCurrency(contest.awarded)}</Text>
            <Text style={{ flex: CW.payment + CW.status }} />
          </View>
        </View>
      )}
    </View>
  );
}

export function TipsPDF({ tenantName, period, report, primaryColor, logo }: TipsPDFProps) {
  const assigned = report.byEmployee.reduce((s, e) => s + e.totalAmount, 0);

  return (
    <Document>
      {/* ── Página 1: Asignación ── */}
      <Page size="A4" style={styles.page}>
        <Header tenantName={tenantName} period={period} primaryColor={primaryColor} logo={logo} />

        <View style={styles.cards}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Total propinas brutas</Text>
            <Text style={styles.cardValue}>{formatCurrency(report.totals.gross)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Provisión menaje (10%)</Text>
            <Text style={[styles.cardValue, { color: "#B94040" }]}>{formatCurrency(report.totals.menaje)}</Text>
          </View>
          {report.totals.contestReserved > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Reservado a concursos</Text>
              <Text style={[styles.cardValue, { color: primaryColor }]}>{formatCurrency(report.totals.contestReserved)}</Text>
            </View>
          )}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Total distribuido</Text>
            <Text style={[styles.cardValue, styles.green]}>{formatCurrency(report.totals.distributed)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Asignación por personal</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[{ flex: A.name }, styles.headerText]}>Personal</Text>
            <Text style={[{ flex: A.hours }, styles.headerText, styles.right]}>Horas trabajadas</Text>
            <Text style={[{ flex: A.pct }, styles.headerText, styles.right]}>% Asignación</Text>
            <Text style={[{ flex: A.total }, styles.headerText, styles.right]}>Total recibido</Text>
          </View>
          {report.byEmployee.map((e, i) => (
            <View key={e.employeeId} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt} wrap={false}>
              <Text style={{ flex: A.name }}>{e.employeeName}</Text>
              <Text style={[{ flex: A.hours }, styles.right]}>{e.totalHours.toFixed(2)}h</Text>
              <Text style={[{ flex: A.pct }, styles.right]}>{e.avgTipPercent}%</Text>
              <Text style={[{ flex: A.total }, styles.right, styles.bold, styles.green]}>{formatCurrency(e.totalAmount)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={[{ flex: A.name + A.hours + A.pct }, styles.bold]}>TOTAL ASIGNADO</Text>
            <Text style={[{ flex: A.total }, styles.right, styles.bold, styles.green]}>{formatCurrency(assigned)}</Text>
          </View>
        </View>

        {report.byEmployee.length > 0 && (
          <View style={[styles.signatures, { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }]}>
            {report.byEmployee.map((e) => (
              <View key={e.employeeId} style={styles.signatureItem} wrap={false}>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureLabel}>
                  Firma del personal: {e.employeeName} — {formatCurrency(e.totalAmount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Footer />
      </Page>

      {/* ── Distribución de concursos: solo si alguno terminó en el rango ── */}
      {report.contests.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Header tenantName={tenantName} period={period} primaryColor={primaryColor} logo={logo} />
          <Text style={styles.sectionTitle}>Distribución de concursos</Text>
          <Text style={styles.intro}>
            Concursos finalizados en este período. El premio se paga en la nómina de la quincena siguiente al cierre
            del concurso; aquí se informa en el período en que terminó.
          </Text>
          {report.contests.map((c) => (
            <ContestSection key={c.id} contest={c} primaryColor={primaryColor} />
          ))}
          <Footer />
        </Page>
      )}

      {/* ── Detalle por día ── */}
      <Page size="A4" style={styles.page}>
        <Header tenantName={tenantName} period={period} primaryColor={primaryColor} logo={logo} />
        <Text style={styles.sectionTitle}>Detalle por día</Text>

        {report.byDay.length === 0 && <Text style={styles.emptyDay}>No hay propinas registradas en este período.</Text>}

        {report.byDay.map((day) => (
          <View key={day.date} style={styles.dayBlock} wrap={false}>
            <View style={[styles.dayHeader, { backgroundColor: primaryColor }]}>
              <Text style={styles.dayHeaderText}>
                {`${formatDate(day.date)} — Bruto ${formatCurrency(day.gross)} | Menaje ${formatCurrency(day.menaje)}` +
                  (day.contestReserved > 0 ? ` | Concursos ${formatCurrency(day.contestReserved)}` : "") +
                  ` | Distribuido ${formatCurrency(day.distributed)}`}
              </Text>
              {day.notes && <Text style={styles.dayNotes}>{day.notes}</Text>}
            </View>
            {day.rows.length === 0 ? (
              <Text style={styles.emptyDay}>Sin horas registradas ese día — no se distribuyó</Text>
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[{ flex: D.name }, styles.headerText]}>Personal</Text>
                  <Text style={[{ flex: D.hours }, styles.headerText, styles.right]}>Horas</Text>
                  <Text style={[{ flex: D.pct }, styles.headerText, styles.right]}>% Prop.</Text>
                  <Text style={[{ flex: D.eff }, styles.headerText, styles.right]}>Hs. ef.</Text>
                  <Text style={[{ flex: D.rate }, styles.headerText, styles.right]}>Prop./h</Text>
                  <Text style={[{ flex: D.amount }, styles.headerText, styles.right]}>Propina</Text>
                </View>
                {day.rows.map((r, i) => (
                  <View key={`${day.date}-${i}`} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                    <Text style={{ flex: D.name }}>{r.employeeName}</Text>
                    <Text style={[{ flex: D.hours }, styles.right]}>{r.hoursWorked.toFixed(2)}h</Text>
                    <Text style={[{ flex: D.pct }, styles.right]}>{r.tipPercent}%</Text>
                    <Text style={[{ flex: D.eff }, styles.right]}>{r.effectiveHours.toFixed(2)}h</Text>
                    <Text style={[{ flex: D.rate }, styles.right]}>{formatCurrency(r.ratePerHour)}</Text>
                    <Text style={[{ flex: D.amount }, styles.right, styles.bold, styles.green]}>{formatCurrency(r.amount)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <Footer />
      </Page>
    </Document>
  );
}
