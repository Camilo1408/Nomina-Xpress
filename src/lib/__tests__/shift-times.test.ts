import { describe, it, expect } from "vitest";
import {
  MAX_DAILY_HOURS,
  MAX_OVERNIGHT_END_MINUTES,
  classifyShift,
  buildShiftDateTimes,
  validateShiftWindow,
  sumDailyHours,
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
