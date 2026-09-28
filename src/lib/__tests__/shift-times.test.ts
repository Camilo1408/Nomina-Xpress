import { describe, it, expect } from "vitest";
import {
  DAILY_ALERT_HOURS,
  MAX_DAILY_HOURS,
  MAX_OVERNIGHT_END_MINUTES,
  classifyShift,
  buildShiftDateTimes,
  validateShiftWindow,
  sumDailyHours,
  flattenEntryShifts,
  buildOvertimeWarning,
  formatTime12,
  formatRange12,
} from "../shift-times";

const HOUR_MS = 60 * 60 * 1000;

describe("constants", () => {
  it("caps the overnight window at 02:00 (120 min) and daily hours at 15", () => {
    expect(MAX_OVERNIGHT_END_MINUTES).toBe(120);
    expect(MAX_DAILY_HOURS).toBe(15);
  });
});

describe("classifyShift", () => {
  it("classifies a normal daytime shift as same-day", () => {
    expect(classifyShift("08:00", "16:00")).toBe("same-day");
  });

  it("classifies a shift ending after midnight (<= 02:00) as overnight", () => {
    expect(classifyShift("13:38", "00:20")).toBe("overnight");
    expect(classifyShift("22:00", "01:00")).toBe("overnight");
  });

  it("allows exactly 02:00 as an overnight end", () => {
    expect(classifyShift("18:00", "02:00")).toBe("overnight");
  });

  it("classifies a checkout past 02:00 that is before the check-in as invalid", () => {
    expect(classifyShift("13:38", "03:00")).toBe("invalid");
  });

  it("classifies equal check-in and check-out as invalid", () => {
    expect(classifyShift("13:38", "13:38")).toBe("invalid");
  });

  it("treats a shift that starts at midnight and ends the same morning as same-day", () => {
    expect(classifyShift("00:00", "02:00")).toBe("same-day");
  });
});

describe("buildShiftDateTimes", () => {
  it("builds an 8h same-day shift with no midnight crossing", () => {
    const res = buildShiftDateTimes("2026-07-19", "08:00", "16:00");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.crossesMidnight).toBe(false);
    expect(res.checkOut).not.toBeNull();
    const diff = new Date(res.checkOut!).getTime() - new Date(res.checkIn).getTime();
    expect(diff).toBe(8 * HOUR_MS);
  });

  it("rolls the checkout to the next day for an overnight shift", () => {
    const res = buildShiftDateTimes("2026-07-19", "13:38", "00:20");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.crossesMidnight).toBe(true);
    // 13:38 -> 00:20 next day = 10h42m = 642 minutes
    const diff = new Date(res.checkOut!).getTime() - new Date(res.checkIn).getTime();
    expect(diff).toBe(642 * 60 * 1000);
    // checkout lands on 2026-07-20 (local calendar day)
    const out = new Date(res.checkOut!);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(6); // July (0-based)
    expect(out.getDate()).toBe(20);
  });

  it("rejects a checkout past 02:00 that would fall before the check-in", () => {
    const res = buildShiftDateTimes("2026-07-19", "13:38", "03:00");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/2:00/);
  });

  it("returns a null checkout when the salida is empty (solo entrada)", () => {
    const res = buildShiftDateTimes("2026-07-19", "08:00", "");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.checkOut).toBeNull();
    expect(res.crossesMidnight).toBe(false);
  });
});

// Server-side validation. Dates are built with explicit UTC ("Z") so the tests
// are deterministic regardless of the machine timezone. Colombia is UTC-5, so a
// Bogota wall-clock time HH:MM corresponds to (HH+5):MM UTC.
describe("validateShiftWindow", () => {
  it("accepts a same-day shift", () => {
    const res = validateShiftWindow(
      "2026-07-19",
      new Date("2026-07-19T13:00:00Z"), // 08:00 Bogota
      new Date("2026-07-19T21:00:00Z") // 16:00 Bogota
    );
    expect(res.ok).toBe(true);
  });

  it("accepts an overnight shift ending before 02:00 the next day", () => {
    const res = validateShiftWindow(
      "2026-07-19",
      new Date("2026-07-19T18:38:00Z"), // 13:38 Bogota
      new Date("2026-07-20T05:20:00Z") // 00:20 Bogota next day
    );
    expect(res.ok).toBe(true);
  });

  it("accepts a checkout at exactly 02:00 the next day", () => {
    const res = validateShiftWindow(
      "2026-07-19",
      new Date("2026-07-19T18:38:00Z"), // 13:38 Bogota
      new Date("2026-07-20T07:00:00Z") // 02:00 Bogota next day
    );
    expect(res.ok).toBe(true);
  });

  it("rejects a checkout past 02:00 the next day", () => {
    const res = validateShiftWindow(
      "2026-07-19",
      new Date("2026-07-19T18:38:00Z"), // 13:38 Bogota
      new Date("2026-07-20T07:01:00Z") // 02:01 Bogota next day
    );
    expect(res.ok).toBe(false);
  });

  it("rejects a checkout that is before the check-in", () => {
    const res = validateShiftWindow(
      "2026-07-19",
      new Date("2026-07-19T18:38:00Z"), // 13:38 Bogota
      new Date("2026-07-19T17:00:00Z") // 12:00 Bogota (earlier)
    );
    expect(res.ok).toBe(false);
  });

  it("rejects a checkout two days after the start day", () => {
    const res = validateShiftWindow(
      "2026-07-19",
      new Date("2026-07-19T18:38:00Z"), // 13:38 Bogota
      new Date("2026-07-21T05:20:00Z") // 00:20 Bogota two days later
    );
    expect(res.ok).toBe(false);
  });

  it("accepts an open shift (no checkout)", () => {
    const res = validateShiftWindow(
      "2026-07-19",
      new Date("2026-07-19T18:38:00Z"),
      null
    );
    expect(res.ok).toBe(true);
  });
});

describe("sumDailyHours", () => {
  const base = { checkIn2: null, checkOut2: null };

  it("sums the hours of every entry for the day", () => {
    const total = sumDailyHours([
      { checkIn: new Date("2026-07-19T08:00:00Z"), checkOut: new Date("2026-07-19T18:00:00Z"), ...base }, // 10h
      { checkIn: new Date("2026-07-19T19:00:00Z"), checkOut: new Date("2026-07-20T01:00:00Z"), ...base }, // 6h
    ]);
    expect(total).toBe(16);
  });

  it("counts both shifts of a split-shift entry", () => {
    const total = sumDailyHours([
      {
        checkIn: new Date("2026-07-19T08:00:00Z"),
        checkOut: new Date("2026-07-19T12:00:00Z"), // 4h
        checkIn2: new Date("2026-07-19T13:00:00Z"),
        checkOut2: new Date("2026-07-19T17:00:00Z"), // 4h
      },
    ]);
    expect(total).toBe(8);
  });

  it("ignores entries without a checkout", () => {
    const total = sumDailyHours([
      { checkIn: new Date("2026-07-19T08:00:00Z"), checkOut: null, ...base },
    ]);
    expect(total).toBe(0);
  });
});

describe("flattenEntryShifts", () => {
  it("returns a single range for a simple entry", () => {
    const ranges = flattenEntryShifts({
      checkIn: new Date("2026-07-19T08:00:00Z"),
      checkOut: new Date("2026-07-19T16:00:00Z"),
      checkIn2: null,
      checkOut2: null,
    });
    expect(ranges).toHaveLength(1);
    expect(ranges[0].checkOut).not.toBeNull();
  });

  it("splits a two-shift entry into two ranges", () => {
    const ranges = flattenEntryShifts({
      checkIn: new Date("2026-07-19T08:00:00Z"),
      checkOut: new Date("2026-07-19T12:00:00Z"),
      checkIn2: new Date("2026-07-19T18:00:00Z"),
      checkOut2: new Date("2026-07-19T22:00:00Z"),
    });
    expect(ranges).toHaveLength(2);
    expect(ranges[1].checkIn.toISOString()).toBe("2026-07-19T18:00:00.000Z");
  });
});

describe("buildOvertimeWarning", () => {
  const range = (from: string, to: string | null): { checkIn: Date; checkOut: Date | null } => ({
    checkIn: new Date(from),
    checkOut: to ? new Date(to) : null,
  });

  it("uses 8 h as the standard workday threshold", () => {
    expect(DAILY_ALERT_HOURS).toBe(8);
  });

  it("returns null for a day of exactly 8 h", () => {
    const warning = buildOvertimeWarning([], [range("2026-07-19T13:00:00Z", "2026-07-19T21:00:00Z")]);
    expect(warning).toBeNull();
  });

  it("flags a single shift longer than 8 h and marks it as single", () => {
    const warning = buildOvertimeWarning([], [range("2026-07-19T13:00:00Z", "2026-07-19T22:30:00Z")]);
    expect(warning).not.toBeNull();
    expect(warning!.kind).toBe("single");
    expect(warning!.totalHours).toBe(9.5);
    expect(warning!.shifts).toHaveLength(1);
    expect(warning!.pendingIndex).toBe(0);
    expect(warning!.shifts[0].checkIn.toISOString()).toBe("2026-07-19T13:00:00.000Z");
  });

  it("flags the second shift of a split day and keeps the first as context", () => {
    const warning = buildOvertimeWarning(
      [],
      [
        range("2026-07-19T13:00:00Z", "2026-07-19T18:00:00Z"), // 5 h
        range("2026-07-19T20:00:00Z", "2026-07-20T00:00:00Z"), // 4 h
      ]
    );
    expect(warning).not.toBeNull();
    expect(warning!.kind).toBe("split");
    expect(warning!.totalHours).toBe(9);
    expect(warning!.shifts).toHaveLength(2);
    expect(warning!.pendingIndex).toBe(1);
    expect(warning!.shifts[0].checkIn.toISOString()).toBe("2026-07-19T13:00:00.000Z");
  });

  it("counts already-saved shifts of the day as prior context", () => {
    const warning = buildOvertimeWarning(
      [range("2026-07-19T13:00:00Z", "2026-07-19T20:00:00Z")], // 7 h ya guardadas
      [range("2026-07-19T21:00:00Z", "2026-07-19T23:00:00Z")] // 2 h nuevas
    );
    expect(warning).not.toBeNull();
    expect(warning!.kind).toBe("split");
    expect(warning!.totalHours).toBe(9);
    expect(warning!.pendingIndex).toBe(1);
    expect(warning!.shifts[0].pending).toBe(false);
    expect(warning!.shifts[0].checkOut!.toISOString()).toBe("2026-07-19T20:00:00.000Z");
  });

  it("numbers shifts by start time: the earliest is always Turno 1", () => {
    // El turno guardado es el de la NOCHE; el que se registra es el de la MAÑANA.
    const warning = buildOvertimeWarning(
      [range("2026-07-20T00:20:00Z", "2026-07-20T03:30:00Z")], // 07:20 p.m. → 10:30 p.m. Bogotá
      [range("2026-07-19T13:20:00Z", "2026-07-19T21:02:00Z")] // 08:20 a.m. → 04:02 p.m. Bogotá
    );
    expect(warning).not.toBeNull();
    // El turno 1 es el más temprano, que aquí es justamente el que se registra.
    expect(warning!.shifts[0].checkIn.toISOString()).toBe("2026-07-19T13:20:00.000Z");
    expect(warning!.shifts[0].pending).toBe(true);
    expect(warning!.pendingIndex).toBe(0);
    expect(warning!.shifts[1].pending).toBe(false);
  });

  it("flags an open second shift when the saved shifts already exceed 8 h", () => {
    const warning = buildOvertimeWarning(
      [range("2026-07-19T13:00:00Z", "2026-07-19T22:00:00Z")], // 9 h ya guardadas
      [range("2026-07-19T23:00:00Z", null)] // segundo turno sin salida
    );
    expect(warning).not.toBeNull();
    expect(warning!.kind).toBe("split");
    expect(warning!.pendingIndex).toBe(1);
    expect(warning!.shifts[1].checkOut).toBeNull();
  });

  it("does not flag an open shift on its own (no hours yet)", () => {
    const warning = buildOvertimeWarning([], [range("2026-07-19T13:00:00Z", null)]);
    expect(warning).toBeNull();
  });

  it("sorts every shift of the day chronologically", () => {
    const warning = buildOvertimeWarning(
      [range("2026-07-19T20:00:00Z", "2026-07-19T23:00:00Z")], // 3 h, tarde
      [
        range("2026-07-19T11:00:00Z", "2026-07-19T15:00:00Z"), // 4 h, mañana
        range("2026-07-20T01:00:00Z", "2026-07-20T04:00:00Z"), // 3 h, madrugada
      ]
    );
    expect(warning).not.toBeNull();
    expect(warning!.shifts.map((r) => r.checkIn.toISOString())).toEqual([
      "2026-07-19T11:00:00.000Z",
      "2026-07-19T20:00:00.000Z",
      "2026-07-20T01:00:00.000Z",
    ]);
    // El aviso lo dispara el último de los que se están registrando.
    expect(warning!.pendingIndex).toBe(2);
    expect(warning!.shifts.map((r) => r.pending)).toEqual([true, false, true]);
  });
});

describe("formatTime12", () => {
  it("convierte la tarde a 12 horas", () => {
    expect(formatTime12("15:00")).toBe("3:00 p. m.");
    expect(formatTime12("13:05")).toBe("1:05 p. m.");
    expect(formatTime12("23:59")).toBe("11:59 p. m.");
  });

  it("convierte la mañana a 12 horas", () => {
    expect(formatTime12("09:30")).toBe("9:30 a. m.");
    expect(formatTime12("11:59")).toBe("11:59 a. m.");
  });

  it("trata la medianoche como 12 a. m.", () => {
    expect(formatTime12("00:00")).toBe("12:00 a. m.");
    expect(formatTime12("00:30")).toBe("12:30 a. m.");
  });

  it("escribe el mediodía en punto como 12:00 m.", () => {
    expect(formatTime12("12:00")).toBe("12:00 m.");
  });

  it("las 12:xx siguen siendo p. m.", () => {
    expect(formatTime12("12:30")).toBe("12:30 p. m.");
  });

  it("conserva el cero a la izquierda en los minutos", () => {
    expect(formatTime12("08:05")).toBe("8:05 a. m.");
  });

  it("tolera segundos en la entrada", () => {
    expect(formatTime12("15:00:00")).toBe("3:00 p. m.");
  });

  it("devuelve cadena vacía para entradas vacías o inválidas", () => {
    expect(formatTime12("")).toBe("");
    expect(formatTime12(null)).toBe("");
    expect(formatTime12(undefined)).toBe("");
    expect(formatTime12("no-es-hora")).toBe("");
    expect(formatTime12("25:00")).toBe("");
  });
});

describe("formatRange12", () => {
  it("une los dos extremos con un guion", () => {
    expect(formatRange12("15:00", "23:00")).toBe("3:00 p. m. – 11:00 p. m.");
  });

  it("devuelve el extremo disponible si falta el otro", () => {
    expect(formatRange12("15:00", null)).toBe("3:00 p. m.");
    expect(formatRange12(null, null)).toBe("");
  });
});
