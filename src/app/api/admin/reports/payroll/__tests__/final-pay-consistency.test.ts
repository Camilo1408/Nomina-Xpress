// Regresión del bug de totales: pantalla, PDF, Excel y portal del empleado
// deben devolver EXACTAMENTE el mismo "total final a pagar", y ese total NO
// puede incluir las propinas (son informativas).
//
// El caso de datos reproduce una quincena real de nómina:
//   80h 8m normales × $6.471  +  32h 24m especiales × $12.024  = $908.120 bruto
//   − $10.225 − $7.000 (ajustes)                                = $890.895 neto
//   + $394.800 (bonos) − $28.470 (descuento)                    = $1.257.225 total
//   $298.443 de propinas NO entran en el total.

import { describe, it, expect, vi, beforeEach } from "vitest";

const SESSION = {
  user: { id: "u1", tenantId: "t1", role: "ADMIN", employeeId: "e1" },
};

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => SESSION) }));
vi.mock("@/lib/get-permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/get-permissions")>();
  return { ...actual, sessionCan: vi.fn(async () => true) };
});
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/logo-loader", () => ({ loadTenantLogo: vi.fn(async () => null) }));
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn(async () => Buffer.from("pdf")),
}));

type ExportedEmployee = Record<string, number>;
type ExportPayload = { employees: ExportedEmployee[] };

// Interceptan lo que las rutas de exportación entregan a cada plantilla.
const pdfCapture = vi.fn((props: ExportPayload) => props.employees.length);
const excelCapture = vi.fn(async (data: ExportPayload) => Buffer.from(`xlsx:${data.employees.length}`));
vi.mock("@/lib/pdf/payroll-template", () => ({
  PayrollPDF: (props: ExportPayload) => pdfCapture(props),
}));
vi.mock("@/lib/excel/payroll-template", () => ({
  generatePayrollExcel: (data: ExportPayload) => excelCapture(data),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    employee: { findMany: vi.fn(), findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    timeEntry: { findMany: vi.fn() },
    payAdjustment: { findMany: vi.fn() },
    tipDistribution: { findMany: vi.fn() },
    bonus: { findMany: vi.fn() },
    discount: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";

const FROM = "2026-07-01";
const TO = "2026-07-15";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const BASE = new Date("2026-07-01T12:00:00Z").getTime();

const EMPLOYEE = {
  id: "e1",
  tenantId: "t1",
  name: "Claudia",
  documentId: null,
  phone: null,
  hourlyRateNormal: 6471,
  hourlyRateSpecial: 12024,
  tipPercent: 100,
  payType: "PAYROLL",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ENTRIES = [
  {
    id: "te-normal",
    tenantId: "t1",
    employeeId: "e1",
    date: "2026-07-01",
    checkIn: new Date(BASE),
    checkOut: new Date(BASE + 80 * HOUR + 8 * MINUTE), // 80h 8m
    checkIn2: null,
    checkOut2: null,
    isSpecial: false,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "te-special",
    tenantId: "t1",
    employeeId: "e1",
    date: "2026-07-05",
    checkIn: new Date(BASE),
    checkOut: new Date(BASE + 32 * HOUR + 24 * MINUTE), // 32h 24m
    checkIn2: null,
    checkOut2: null,
    isSpecial: true,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const ADJUSTMENTS = [
  { id: "a1", tenantId: "t1", employeeId: "e1", type: "DISCOUNT", amount: 10_225, description: "ALBONDIGAS", periodStart: FROM, periodEnd: TO, createdAt: new Date() },
  { id: "a2", tenantId: "t1", employeeId: "e1", type: "DISCOUNT", amount: 7_000, description: "COMIDA", periodStart: FROM, periodEnd: TO, createdAt: new Date() },
];

const BONUSES = [
  { id: "b1", name: "Auxilio de Transporte", description: null, valueType: "STANDARD", amount: 100_000, assignmentType: "PAYROLL", frequency: "BIWEEKLY", monthlyMode: null, assignments: [] },
  { id: "b2", name: "Dias de descanso", description: null, valueType: "STANDARD", amount: 94_800, assignmentType: "PAYROLL", frequency: "BIWEEKLY", monthlyMode: null, assignments: [] },
  { id: "b3", name: "Bono Quincenal", description: null, valueType: "STANDARD", amount: 200_000, assignmentType: "PAYROLL", frequency: "BIWEEKLY", monthlyMode: null, assignments: [] },
];

const DISCOUNTS = [
  { id: "d1", name: "Pension", description: null, valueType: "STANDARD", amount: 28_470, assignmentType: "PAYROLL", frequency: "BIWEEKLY", monthlyMode: null, assignments: [] },
];

const TIPS = [
  { id: "td1", employeeId: "e1", amount: 298_443, hoursWorked: 100, tipPercent: 100, tipEntry: { date: "2026-07-03", totalAmount: 1_000_000 } },
];

const GROSS = 908_120;
const NET = 890_895;
const FINAL = 1_257_225;
const TIPS_TOTAL = 298_443;

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.employee.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([EMPLOYEE]);
  (prisma.employee.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(EMPLOYEE);
  (prisma.tenant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "t1", name: "Cucina", primaryColor: "#C1643F", logoUrl: null });
  (prisma.timeEntry.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(ENTRIES);
  (prisma.payAdjustment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(ADJUSTMENTS);
  (prisma.tipDistribution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(TIPS);
  (prisma.bonus.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(BONUSES);
  (prisma.discount.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(DISCOUNTS);
});

function req(path: string) {
  return new Request(`http://localhost${path}?from=${FROM}&to=${TO}&type=payroll`);
}

async function screenReport() {
  const { GET } = await import("../route");
  const res = await GET(req("/api/admin/reports/payroll"));
  const body = await res.json();
  return body.employees[0];
}

async function pdfReport() {
  const { GET } = await import("../export/pdf/route");
  await GET(req("/api/admin/reports/payroll/export/pdf"));
  expect(pdfCapture).toHaveBeenCalledTimes(1);
  return pdfCapture.mock.calls[0][0].employees[0];
}

async function excelReport() {
  const { GET } = await import("../export/excel/route");
  await GET(req("/api/admin/reports/payroll/export/excel"));
  expect(excelCapture).toHaveBeenCalledTimes(1);
  return excelCapture.mock.calls[0][0].employees[0];
}

async function portalReport() {
  const { GET } = await import("@/app/api/employee/report/route");
  const res = await GET(req("/api/employee/report"));
  return res.json();
}

describe("total final a pagar — la cadena bruto → neto → total", () => {
  it("el reporte en pantalla descompone el cálculo tal como se muestra en la tabla", async () => {
    const emp = await screenReport();
    expect(emp.grossPay).toBe(GROSS);
    expect(emp.totalAdjustments).toBe(-17_225);
    // El "Neto" de la tabla YA tiene los ajustes restados.
    expect(emp.netPay).toBe(NET);
    expect(emp.netPay).toBe(emp.grossPay + emp.totalAdjustments);
    expect(emp.totalBonuses).toBe(394_800);
    expect(emp.totalDiscounts).toBe(28_470);
    expect(emp.finalPay).toBe(FINAL);
    expect(emp.finalPay).toBe(emp.netPay + emp.totalBonuses - emp.totalDiscounts);
  });

  it("las propinas se informan aparte y NO entran en el total final", async () => {
    const emp = await screenReport();
    expect(emp.totalTips).toBe(TIPS_TOTAL);
    expect(emp.netPayWithTips).toBe(NET + TIPS_TOTAL);
    expect(emp.finalPay).not.toBe(emp.netPayWithTips + emp.totalBonuses - emp.totalDiscounts);
    expect(emp.finalPay).toBe(FINAL);
  });

  it("los ajustes exponen su período para poder corregirlo desde la UI", async () => {
    const emp = await screenReport();
    expect(emp.adjustments).toHaveLength(2);
    expect(emp.adjustments[0]).toMatchObject({ periodStart: FROM, periodEnd: TO });
  });
});

describe("consistencia entre pantalla, PDF, Excel y portal del empleado", () => {
  it("el PDF exporta el mismo total final que la pantalla (sin propinas)", async () => {
    const pdf = await pdfReport();
    expect(pdf.finalPay).toBe(FINAL);
    expect(pdf.netPay).toBe(NET);
    expect(pdf.totalTips).toBe(TIPS_TOTAL);
  });

  it("el Excel exporta el mismo total final que la pantalla (sin propinas)", async () => {
    const xls = await excelReport();
    expect(xls.finalPay).toBe(FINAL);
    expect(xls.netPay).toBe(NET);
    expect(xls.totalTips).toBe(TIPS_TOTAL);
  });

  it("el portal del empleado muestra el mismo total final", async () => {
    const portal = await portalReport();
    expect(portal.netPayWithBonusesAndDiscounts).toBe(FINAL);
    expect(portal.netPay).toBe(NET);
  });

  it("las cuatro superficies coinciden al peso", async () => {
    const [screen, pdf, xls, portal] = [
      await screenReport(),
      await pdfReport(),
      await excelReport(),
      await portalReport(),
    ];
    const totals = [screen.finalPay, pdf.finalPay, xls.finalPay, portal.netPayWithBonusesAndDiscounts];
    expect(new Set(totals).size).toBe(1);
    expect(totals[0]).toBe(FINAL);
  });
});

describe("rangos de más de una quincena", () => {
  // Ajustes repartidos en dos meses, uno de ellos con el período desalineado
  // (16-jun → 01-jul), que con el filtro anterior desaparecía de TODOS los reportes.
  const MULTI_ADJ = [
    { ...ADJUSTMENTS[0], id: "jun-1", amount: 10_000, periodStart: "2026-06-16", periodEnd: "2026-07-01" },
    { ...ADJUSTMENTS[0], id: "jul-1", amount: 5_000, periodStart: "2026-07-01", periodEnd: "2026-07-15" },
    { ...ADJUSTMENTS[0], id: "jul-2", amount: 3_000, periodStart: "2026-07-16", periodEnd: "2026-07-31" },
  ];

  // Emula el filtro real de Prisma sobre periodStart para poder comprobar la
  // semántica de anclaje sin levantar una base de datos.
  function wireAdjustments() {
    (prisma.payAdjustment.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { periodStart: { gte: string; lte: string } } }) =>
        MULTI_ADJ.filter((a) => a.periodStart >= where.periodStart.gte && a.periodStart <= where.periodStart.lte)
    );
  }

  async function reportFor(from: string, to: string) {
    const { GET } = await import("../route");
    const res = await GET(new Request(`http://localhost/api/admin/reports/payroll?from=${from}&to=${to}&type=payroll`));
    return (await res.json()).employees[0];
  }

  it("un ajuste con el período desalineado ya NO desaparece: cae en la quincena en la que empieza", async () => {
    wireAdjustments();
    const junio2 = await reportFor("2026-06-16", "2026-06-30");
    expect(junio2.adjustments.map((a: { id: string }) => a.id)).toEqual(["jun-1"]);
    expect(junio2.totalAdjustments).toBe(-10_000);
  });

  it("y no se cuenta otra vez en la quincena siguiente", async () => {
    wireAdjustments();
    const julio1 = await reportFor("2026-07-01", "2026-07-15");
    expect(julio1.adjustments.map((a: { id: string }) => a.id)).toEqual(["jul-1"]);
  });

  it("un reporte de dos meses trae los ajustes de ambos, cada uno una sola vez", async () => {
    wireAdjustments();
    const dosMeses = await reportFor("2026-06-01", "2026-07-31");
    expect(dosMeses.adjustments.map((a: { id: string }) => a.id)).toEqual(["jun-1", "jul-1", "jul-2"]);
    expect(dosMeses.totalAdjustments).toBe(-18_000);
  });

  it("la suma de las quincenas por separado coincide con el reporte del rango completo", async () => {
    wireAdjustments();
    const quincenas = [
      await reportFor("2026-06-01", "2026-06-15"),
      await reportFor("2026-06-16", "2026-06-30"),
      await reportFor("2026-07-01", "2026-07-15"),
      await reportFor("2026-07-16", "2026-07-31"),
    ];
    const sumaAjustes = quincenas.reduce((s, q) => s + q.totalAdjustments, 0);
    const rango = await reportFor("2026-06-01", "2026-07-31");
    expect(rango.totalAdjustments).toBe(sumaAjustes);
    // Y los bonos/descuentos recurrentes acompañan: 4 quincenas en el rango.
    expect(rango.totalBonuses).toBe(quincenas.reduce((s, q) => s + q.totalBonuses, 0));
    expect(rango.totalDiscounts).toBe(quincenas.reduce((s, q) => s + q.totalDiscounts, 0));
    expect(rango.totalBonuses).toBe(394_800 * 4);
    expect(rango.bonuses[0].periodsCount).toBe(4);
  });
});

describe("aislamiento de datos", () => {
  it("todas las consultas del reporte filtran por el tenantId de la sesión", async () => {
    await screenReport();
    const calls = [
      (prisma.employee.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0],
      (prisma.timeEntry.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0],
      (prisma.payAdjustment.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0],
      (prisma.tipDistribution.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0],
      (prisma.bonus.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0],
      (prisma.discount.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0],
    ];
    for (const call of calls) {
      expect(call.where.tenantId).toBe("t1");
    }
  });

  it("el reporte en pantalla no filtra por empleado si no se pide uno", async () => {
    await screenReport();
    const where = (prisma.employee.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(where.active).toBe(true);
    expect(where.id).toBeUndefined();
  });
});
