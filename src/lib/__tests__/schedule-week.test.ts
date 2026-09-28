import { describe, it, expect } from "vitest";
import {
  addDays,
  getWeekDates,
  dayLabelFor,
  dayNameFor,
  isSunday,
  suggestWeekStart,
  formatDayNumber,
  findOverlaps,
  type WeekRange,
} from "../schedule-week";

describe("addDays", () => {
  it("suma días dentro del mismo mes", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-08-10", 5)).toBe("2026-08-15");
  });

  it("cruza fin de mes y de año", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("acepta desplazamientos negativos y cero", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-08-31", 0)).toBe("2026-08-31");
  });

  it("maneja el 29 de febrero de un año bisiesto", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("getWeekDates", () => {
  it("devuelve 7 fechas consecutivas desde el inicio", () => {
    expect(getWeekDates("2026-08-31")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  it("funciona cuando la semana empieza en domingo", () => {
    const dates = getWeekDates("2026-08-30");
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-08-30");
    expect(dates[6]).toBe("2026-09-05");
  });
});

describe("dayLabelFor / dayNameFor", () => {
  it("etiqueta correctamente los siete días desde un lunes", () => {
    // 2026-08-31 es lunes
    const labels = getWeekDates("2026-08-31").map(dayLabelFor);
    expect(labels).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);
  });

  it("etiqueta correctamente una semana que empieza en domingo", () => {
    // 2026-08-30 es domingo
    const labels = getWeekDates("2026-08-30").map(dayLabelFor);
    expect(labels).toEqual(["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]);
  });

  it("devuelve el nombre completo en minúsculas", () => {
    expect(dayNameFor("2026-08-31")).toBe("lunes");
    expect(dayNameFor("2026-08-30")).toBe("domingo");
  });
});

describe("isSunday", () => {
  it("identifica el domingo sin depender de la zona horaria", () => {
    expect(isSunday("2026-08-30")).toBe(true);
    expect(isSunday("2026-08-31")).toBe(false);
    expect(isSunday("2026-09-06")).toBe(true);
  });
});

describe("formatDayNumber", () => {
  it("devuelve día/mes con dos dígitos", () => {
    expect(formatDayNumber("2026-08-31")).toBe("31/08");
    expect(formatDayNumber("2026-01-05")).toBe("05/01");
  });
});

describe("suggestWeekStart", () => {
  const hoy = "2026-08-31"; // lunes

  it("sin horarios previos sugiere el lunes de la semana en curso", () => {
    expect(suggestWeekStart(null, hoy)).toBe("2026-08-31");
  });

  it("sin horarios previos, un miércoles, sugiere el lunes de esa semana", () => {
    expect(suggestWeekStart(null, "2026-09-02")).toBe("2026-08-31");
  });

  it("sin horarios previos, un domingo, sugiere el lunes de esa misma semana", () => {
    // 2026-09-06 es domingo: su semana empezó el lunes 2026-08-31
    expect(suggestWeekStart(null, "2026-09-06")).toBe("2026-08-31");
  });

  it("si el último día cubierto ya pasó, vuelve al lunes de la semana en curso", () => {
    expect(suggestWeekStart("2026-08-23", hoy)).toBe("2026-08-31");
  });

  it("si el último día cubierto está en el futuro, arranca al día siguiente", () => {
    expect(suggestWeekStart("2026-09-06", hoy)).toBe("2026-09-07");
  });

  it("si el último día cubierto es hoy, arranca mañana", () => {
    expect(suggestWeekStart(hoy, hoy)).toBe("2026-09-01");
  });

  it("el domingo ya asignado no se repite: el horario nuevo arranca el lunes siguiente", () => {
    // La semana vigente va del lunes 2026-08-24 al domingo 2026-08-30 y ya
    // está asignada. Hoy es domingo 2026-08-30, ese domingo se trabaja.
    // El horario nuevo debe arrancar el lunes 2026-08-31, no repetir la semana.
    expect(suggestWeekStart("2026-08-30", "2026-08-30")).toBe("2026-08-31");
  });
});

describe("findOverlaps", () => {
  const ranges: WeekRange[] = [
    { id: "a", name: "Horario semana 2026-08-24", start: "2026-08-24", end: "2026-08-30" },
    { id: "b", name: "Horario semana 2026-09-07", start: "2026-09-07", end: "2026-09-13" },
  ];

  it("no reporta nada cuando la semana elegida cae en el hueco libre", () => {
    expect(findOverlaps("2026-08-31", ranges)).toEqual([]);
  });

  it("detecta un solapamiento parcial por el inicio", () => {
    const found = findOverlaps("2026-08-28", ranges);
    expect(found.map((r) => r.id)).toEqual(["a"]);
  });

  it("detecta un solapamiento parcial por el final", () => {
    const found = findOverlaps("2026-09-05", ranges);
    expect(found.map((r) => r.id)).toEqual(["b"]);
  });

  it("detecta el solapamiento exacto", () => {
    const found = findOverlaps("2026-08-24", ranges);
    expect(found.map((r) => r.id)).toEqual(["a"]);
  });

  it("puede reportar varios solapamientos a la vez", () => {
    const juntos: WeekRange[] = [
      { id: "a", name: "A", start: "2026-08-31", end: "2026-09-06" },
      { id: "b", name: "B", start: "2026-09-02", end: "2026-09-08" },
    ];
    expect(findOverlaps("2026-09-01", juntos).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("ignora un rango que se excluye a sí mismo", () => {
    expect(findOverlaps("2026-08-24", ranges, "a")).toEqual([]);
  });
});
