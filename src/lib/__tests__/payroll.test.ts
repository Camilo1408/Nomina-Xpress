import { describe, it, expect } from "vitest";
import { calculateHours, calculatePayroll } from "../payroll";
import { isSpecialDay, isColombianHoliday } from "../holidays";
import { getContrastText } from "../color-contrast";
import { formatCurrency, formatHours } from "../utils";
import type { Employee, TimeEntry, PayAdjustment } from "../../generated/prisma";

function makeEmployee(overrides?: Partial<Employee>): Employee {
  return {
    id: "emp1",
    tenantId: "tenant1",
    name: "Test Employee",
    documentId: null,
    phone: null,
    hourlyRateNormal: 6400,
    hourlyRateSpecial: 11500,
    tipPercent: 100,
    payType: "PAYROLL",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEntry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: "entry1",
    tenantId: "tenant1",
    employeeId: "emp1",
    date: "2026-05-05",
    checkIn: new Date("2026-05-05T08:00:00"),
    checkOut: new Date("2026-05-05T16:00:00"),
    checkIn2: null,
    checkOut2: null,
    isSpecial: false,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("calculateHours", () => {
  it("calculates 8 hours correctly", () => {
    const checkIn = new Date("2026-05-05T08:00:00");
    const checkOut = new Date("2026-05-05T16:00:00");
    expect(calculateHours(checkIn, checkOut)).toBe(8);
  });

  it("returns 0 if checkout is before checkin", () => {
    const checkIn = new Date("2026-05-05T16:00:00");
    const checkOut = new Date("2026-05-05T08:00:00");
    expect(calculateHours(checkIn, checkOut)).toBe(0);
  });

  it("handles fractional hours", () => {
    const checkIn = new Date("2026-05-05T08:00:00");
    const checkOut = new Date("2026-05-05T09:30:00");
    expect(calculateHours(checkIn, checkOut)).toBe(1.5);
  });
});

describe("isSpecialDay", () => {
  it("detects Sunday as special", () => {
    const sunday = new Date("2026-05-03T12:00:00"); // May 3 2026 is a Sunday
    expect(isSpecialDay(sunday)).toBe(true);
  });

  it("detects Monday as NOT special", () => {
    const monday = new Date("2026-05-04T12:00:00"); // May 4 2026 is a Monday
    expect(isSpecialDay(monday)).toBe(false);
  });

  it("detects Colombian festivos — 1 enero (Año Nuevo)", () => {
    const newYear = new Date("2026-01-01T12:00:00");
    expect(isColombianHoliday(newYear)).toBe(true);
    expect(isSpecialDay(newYear)).toBe(true);
  });

  it("detects Colombian festivos — 1 mayo (Día del Trabajo)", () => {
    const laborDay = new Date("2026-05-01T12:00:00");
    expect(isColombianHoliday(laborDay)).toBe(true);
    expect(isSpecialDay(laborDay)).toBe(true);
  });

  it("detects Colombian festivos — 20 julio (Independencia)", () => {
    const independence = new Date("2026-07-20T12:00:00");
    expect(isColombianHoliday(independence)).toBe(true);
    expect(isSpecialDay(independence)).toBe(true);
  });

  it("detects Colombian festivos — 7 agosto (Batalla de Boyacá)", () => {
    const boyaca = new Date("2026-08-07T12:00:00");
    expect(isColombianHoliday(boyaca)).toBe(true);
    expect(isSpecialDay(boyaca)).toBe(true);
  });

  it("detects Colombian festivos — 25 diciembre (Navidad)", () => {
    const christmas = new Date("2026-12-25T12:00:00");
    expect(isColombianHoliday(christmas)).toBe(true);
    expect(isSpecialDay(christmas)).toBe(true);
  });
});

describe("calculatePayroll", () => {
  const employee = makeEmployee();

  it("calculates gross pay for normal hours correctly", () => {
    const entry = makeEntry({ isSpecial: false });
    const result = calculatePayroll(employee, [entry], []);
    expect(result.normalHours).toBe(8);
    expect(result.specialHours).toBe(0);
    expect(result.grossPay).toBe(8 * 6400); // 51200
    expect(result.netPay).toBe(51200);
  });

  it("calculates gross pay for special hours correctly", () => {
    const entry = makeEntry({ isSpecial: true });
    const result = calculatePayroll(employee, [entry], []);
    expect(result.normalHours).toBe(0);
    expect(result.specialHours).toBe(8);
    expect(result.grossPay).toBe(8 * 11500); // 92000
    expect(result.netPay).toBe(92000);
  });

  it("skips entries without checkout", () => {
    const entry = makeEntry({ checkOut: null });
    const result = calculatePayroll(employee, [entry], []);
    expect(result.normalHours).toBe(0);
    expect(result.grossPay).toBe(0);
  });

  it("applies DISCOUNT adjustment correctly", () => {
    const entry = makeEntry({ isSpecial: false });
    const adj: PayAdjustment = {
      id: "adj1",
      tenantId: "tenant1",
      employeeId: "emp1",
      type: "DISCOUNT",
      amount: 10000,
      description: "Descuento",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-15",
      createdAt: new Date(),
    };
    const result = calculatePayroll(employee, [entry], [adj]);
    expect(result.grossPay).toBe(51200);
    expect(result.totalAdjustments).toBe(-10000);
    expect(result.netPay).toBe(41200);
  });

  it("applies BONUS adjustment correctly", () => {
    const entry = makeEntry({ isSpecial: false });
    const adj: PayAdjustment = {
      id: "adj2",
      tenantId: "tenant1",
      employeeId: "emp1",
      type: "BONUS",
      amount: 5000,
      description: "Bono",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-15",
      createdAt: new Date(),
    };
    const result = calculatePayroll(employee, [entry], [adj]);
    expect(result.netPay).toBe(56200);
  });

  it("pays overnight hours at the START day's rate (Saturday shift into Sunday)", () => {
    // Sábado 9 may 2026 18:00 → domingo 10 may 01:00 = 7h. El registro es del
    // sábado (isSpecial=false), así que TODAS las horas, incluida la madrugada
    // del domingo, se pagan a tarifa NORMAL del día inicial.
    const overnight = makeEntry({
      isSpecial: false,
      date: "2026-05-09",
      checkIn: new Date("2026-05-09T18:00:00"),
      checkOut: new Date("2026-05-10T01:00:00"),
    });
    const result = calculatePayroll(employee, [overnight], []);
    expect(result.normalHours).toBe(7);
    expect(result.specialHours).toBe(0);
    expect(result.grossPay).toBe(7 * 6400);
  });

  it("mixes normal and special hours across multiple entries", () => {
    const normalEntry = makeEntry({ id: "e1", isSpecial: false });
    const specialEntry = makeEntry({
      id: "e2",
      isSpecial: true,
      date: "2026-05-10",
      checkIn: new Date("2026-05-10T08:00:00"),
      checkOut: new Date("2026-05-10T12:00:00"),
    });
    const result = calculatePayroll(employee, [normalEntry, specialEntry], []);
    expect(result.normalHours).toBe(8);
    expect(result.specialHours).toBe(4);
    expect(result.grossPay).toBe(8 * 6400 + 4 * 11500); // 51200 + 46000 = 97200
  });
});

describe("getContrastText", () => {
  it("returns dark text on light background", () => {
    expect(getContrastText("#FAF7F2")).toBe("#2C1F15");
    expect(getContrastText("#FFFFFF")).toBe("#2C1F15");
  });

  it("returns light text on dark background", () => {
    expect(getContrastText("#2C1F15")).toBe("#FAF7F2");
    expect(getContrastText("#000000")).toBe("#FAF7F2");
  });

  it("returns appropriate text for brand primary color", () => {
    const result = getContrastText("#C1643F");
    expect(["#2C1F15", "#FAF7F2"]).toContain(result);
  });
});

describe("formatCurrency", () => {
  it("formats COP correctly", () => {
    const result = formatCurrency(51200);
    expect(result).toContain("51");
    expect(result).toContain("200");
  });
});

describe("formatHours", () => {
  it("formats whole hours", () => {
    expect(formatHours(8)).toBe("8h");
  });

  it("formats hours with minutes", () => {
    expect(formatHours(8.5)).toBe("8h 30m");
  });

  it("handles 0 hours", () => {
    expect(formatHours(0)).toBe("0h");
  });
});
