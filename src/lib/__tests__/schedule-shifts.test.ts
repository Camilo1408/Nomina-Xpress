import { describe, it, expect } from "vitest";
import {
  REST_DAY_SENTINEL,
  buildRestDayShift,
  buildWorkShift,
  toShiftDTO,
  isWorkShift,
} from "../schedule-shifts";

describe("buildRestDayShift", () => {
  it("marca el descanso y guarda el centinela en las horas", () => {
    const row = buildRestDayShift("emp-1", "2026-08-31");
    expect(row).toEqual({
      employeeId: "emp-1",
      date: "2026-08-31",
      startTime: REST_DAY_SENTINEL,
      endTime: REST_DAY_SENTINEL,
      startTime2: null,
      endTime2: null,
      restDay: true,
    });
  });

  it("nunca lleva segundo turno", () => {
    const row = buildRestDayShift("emp-1", "2026-08-31");
    expect(row.startTime2).toBeNull();
    expect(row.endTime2).toBeNull();
  });
});

describe("buildWorkShift", () => {
  it("conserva las horas y marca restDay en false", () => {
    const row = buildWorkShift({
      employeeId: "emp-1",
      date: "2026-08-31",
      startTime: "15:00",
      endTime: "23:00",
    });
    expect(row.startTime).toBe("15:00");
    expect(row.endTime).toBe("23:00");
    expect(row.restDay).toBe(false);
    expect(row.startTime2).toBeNull();
  });

  it("conserva el segundo turno cuando viene completo", () => {
    const row = buildWorkShift({
      employeeId: "emp-1",
      date: "2026-08-31",
      startTime: "08:00",
      endTime: "12:00",
      startTime2: "18:00",
      endTime2: "22:00",
    });
    expect(row.startTime2).toBe("18:00");
    expect(row.endTime2).toBe("22:00");
  });

  it("normaliza a null un segundo turno vacío", () => {
    const row = buildWorkShift({
      employeeId: "emp-1",
      date: "2026-08-31",
      startTime: "08:00",
      endTime: "12:00",
      startTime2: "",
      endTime2: "",
    });
    expect(row.startTime2).toBeNull();
    expect(row.endTime2).toBeNull();
  });
});

describe("toShiftDTO", () => {
  it("un día de descanso nunca expone horas", () => {
    const dto = toShiftDTO(buildRestDayShift("emp-1", "2026-08-31"));
    expect(dto.startTime).toBeNull();
    expect(dto.endTime).toBeNull();
    expect(dto.startTime2).toBeNull();
    expect(dto.endTime2).toBeNull();
    expect(dto.restDay).toBe(true);
  });

  it("blanquea el centinela aunque la fila venga sucia desde la base de datos", () => {
    // Fila escrita por una versión anterior o por un payload malicioso: tiene
    // horas reales y restDay en true. El DTO no debe filtrarlas.
    const dto = toShiftDTO({
      startTime: "15:00",
      endTime: "23:00",
      startTime2: "18:00",
      endTime2: "22:00",
      restDay: true,
    });
    expect(dto.startTime).toBeNull();
    expect(dto.endTime).toBeNull();
    expect(dto.startTime2).toBeNull();
    expect(dto.endTime2).toBeNull();
  });

  it("un turno normal conserva sus horas intactas", () => {
    const dto = toShiftDTO({
      startTime: "15:00",
      endTime: "23:00",
      startTime2: null,
      endTime2: null,
      restDay: false,
    });
    expect(dto.startTime).toBe("15:00");
    expect(dto.endTime).toBe("23:00");
  });

  it("conserva los campos extra de la fila (id, empleado)", () => {
    const dto = toShiftDTO({
      id: "shift-1",
      employee: { name: "María" },
      startTime: "15:00",
      endTime: "23:00",
      startTime2: null,
      endTime2: null,
      restDay: false,
    });
    expect(dto.id).toBe("shift-1");
    expect(dto.employee).toEqual({ name: "María" });
  });

  it("un turno guardado antes del cambio (restDay false) sigue funcionando", () => {
    const dto = toShiftDTO({
      startTime: "09:00",
      endTime: "17:00",
      startTime2: null,
      endTime2: null,
      restDay: false,
    });
    expect(dto.startTime).toBe("09:00");
    expect(dto.restDay).toBe(false);
  });
});

describe("isWorkShift", () => {
  it("distingue turno de descanso", () => {
    expect(isWorkShift(buildRestDayShift("e", "2026-08-31"))).toBe(false);
    expect(
      isWorkShift(
        buildWorkShift({
          employeeId: "e",
          date: "2026-08-31",
          startTime: "15:00",
          endTime: "23:00",
        })
      )
    ).toBe(true);
  });
});
