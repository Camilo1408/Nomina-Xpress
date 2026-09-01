import { describe, it, expect } from "vitest";
import {
  fromValue24,
  toValue24,
  parseTypedTime,
} from "../time-input-12";

describe("fromValue24", () => {
  it("muestra la hora en 12 horas", () => {
    expect(fromValue24("15:30")).toEqual({
      display: "3:30",
      meridiem: "PM",
      value: "15:30",
    });
    expect(fromValue24("09:05")).toEqual({
      display: "9:05",
      meridiem: "AM",
      value: "09:05",
    });
  });

  it("medianoche y mediodía", () => {
    expect(fromValue24("00:00").display).toBe("12:00");
    expect(fromValue24("00:00").meridiem).toBe("AM");
    expect(fromValue24("12:00").display).toBe("12:00");
    expect(fromValue24("12:00").meridiem).toBe("PM");
  });

  it("vacío o inválido", () => {
    expect(fromValue24("")).toEqual({ display: "", meridiem: "", value: "" });
    expect(fromValue24("nada")).toEqual({ display: "", meridiem: "", value: "" });
  });
});

describe("toValue24", () => {
  it("compone la hora de 24 horas", () => {
    expect(toValue24("3:30", "PM")).toBe("15:30");
    expect(toValue24("3:30", "AM")).toBe("03:30");
    expect(toValue24("12:00", "AM")).toBe("00:00");
    expect(toValue24("12:00", "PM")).toBe("12:00");
  });

  it("sin a. m./p. m. no hay hora válida", () => {
    expect(toValue24("3:30", "")).toBe("");
    expect(toValue24("", "PM")).toBe("");
  });
});

describe("parseTypedTime — escribir la hora", () => {
  it("solo la hora se completa con :00", () => {
    expect(parseTypedTime("3", "PM")?.display).toBe("3:00");
    expect(parseTypedTime("3", "PM")?.value).toBe("15:00");
  });

  it("acepta el separador de dos puntos", () => {
    expect(parseTypedTime("3:30", "PM")?.value).toBe("15:30");
  });

  it("completa el minuto de un solo dígito", () => {
    expect(parseTypedTime("3:5", "PM")?.display).toBe("3:05");
  });

  it("acepta el punto como separador", () => {
    expect(parseTypedTime("3.30", "PM")?.value).toBe("15:30");
  });

  it("acepta cuatro dígitos seguidos", () => {
    expect(parseTypedTime("1530")?.value).toBe("15:30");
    expect(parseTypedTime("0830")?.value).toBe("08:30");
  });

  it("acepta tres dígitos seguidos", () => {
    expect(parseTypedTime("300", "PM")?.display).toBe("3:00");
    expect(parseTypedTime("945", "AM")?.value).toBe("09:45");
  });

  it("lee el sufijo escrito de varias formas", () => {
    for (const t of ["3pm", "3 pm", "3p.m.", "3 p. m.", "3P.M.", "3p"]) {
      expect(parseTypedTime(t)?.value).toBe("15:00");
    }
    for (const t of ["9am", "9 a.m.", "9a"]) {
      expect(parseTypedTime(t)?.value).toBe("09:00");
    }
  });

  it("una hora escrita en 24 horas se convierte sola", () => {
    expect(parseTypedTime("15:00")).toMatchObject({
      display: "3:00",
      meridiem: "PM",
      value: "15:00",
    });
    expect(parseTypedTime("23:59")).toMatchObject({
      display: "11:59",
      meridiem: "PM",
      value: "23:59",
    });
  });

  it("las 24 horas mandan sobre un sufijo contradictorio", () => {
    // "15:00 am" no existe: los dígitos son inequívocos.
    expect(parseTypedTime("15:00am")?.value).toBe("15:00");
  });

  it("medianoche escrita como 0", () => {
    expect(parseTypedTime("0:00")).toMatchObject({
      display: "12:00",
      meridiem: "AM",
      value: "00:00",
    });
  });

  it("las 12 respetan el sufijo escrito", () => {
    expect(parseTypedTime("12am")?.value).toBe("00:00");
    expect(parseTypedTime("12pm")?.value).toBe("12:00");
  });

  it("conserva el a. m./p. m. que ya tenía el campo", () => {
    expect(parseTypedTime("8", "PM")?.value).toBe("20:00");
    expect(parseTypedTime("8", "AM")?.value).toBe("08:00");
  });

  it("sin sufijo ni valor previo queda pendiente de a. m./p. m.", () => {
    const r = parseTypedTime("8");
    expect(r?.display).toBe("8:00");
    expect(r?.meridiem).toBe("");
    expect(r?.value).toBe("");
  });

  it("el texto vacío limpia el campo", () => {
    expect(parseTypedTime("")).toEqual({ display: "", meridiem: "", value: "" });
    expect(parseTypedTime("   ")).toEqual({ display: "", meridiem: "", value: "" });
  });

  it("rechaza lo que no es una hora", () => {
    expect(parseTypedTime("abc")).toBeNull();
    expect(parseTypedTime("25:00")).toBeNull();
    expect(parseTypedTime("3:75")).toBeNull();
    expect(parseTypedTime("123456")).toBeNull();
  });

  it("va y vuelve sin perder información", () => {
    for (const t of ["00:00", "08:30", "12:00", "15:45", "23:59"]) {
      const parsed = parseTypedTime(fromValue24(t).display, fromValue24(t).meridiem);
      expect(parsed?.value).toBe(t);
    }
  });
});
