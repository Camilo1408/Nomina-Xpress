import { describe, it, expect, afterEach } from "vitest";
import { diffChanges, compactUserAgent } from "../audit";
import { getRetentionMonths, DEFAULT_AUDIT_RETENTION_MONTHS } from "../audit-retention";

describe("diffChanges — solo conserva campos que cambiaron", () => {
  it("recorta a los campos modificados en una edición", () => {
    const before = { name: "Ana", rate: 6000, active: true };
    const after = { name: "Ana", rate: 6900, active: true };
    expect(diffChanges(before, after)).toEqual({
      before: { rate: 6000 },
      after: { rate: 6900 },
    });
  });

  it("devuelve objetos vacíos cuando nada cambió", () => {
    const obj = { a: 1, b: 2 };
    expect(diffChanges(obj, { ...obj })).toEqual({ before: {}, after: {} });
  });

  it("detecta altas y bajas de campos", () => {
    expect(diffChanges({ a: 1 }, { a: 1, b: 2 })).toEqual({
      before: { b: undefined },
      after: { b: 2 },
    });
  });

  it("no toca valores que no son objetos planos (CREATE/DELETE)", () => {
    expect(diffChanges(null, { x: 1 })).toEqual({ before: null, after: { x: 1 } });
    expect(diffChanges({ x: 1 }, null)).toEqual({ before: { x: 1 }, after: null });
  });
});

describe("compactUserAgent — recorta el campo más pesado", () => {
  it("omite el user-agent en eventos de autenticación", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    expect(compactUserAgent(ua, "LOGIN")).toBeNull();
    expect(compactUserAgent(ua, "LOGOUT")).toBeNull();
    expect(compactUserAgent(ua, "LOGIN_FAILED")).toBeNull();
  });

  it("trunca el user-agent en el resto de eventos", () => {
    const ua = "x".repeat(300);
    const out = compactUserAgent(ua, "UPDATE");
    expect(out).not.toBeNull();
    expect(out!.length).toBe(160);
  });

  it("devuelve null si no hay user-agent", () => {
    expect(compactUserAgent(null, "UPDATE")).toBeNull();
    expect(compactUserAgent(undefined, "CREATE")).toBeNull();
  });
});

describe("getRetentionMonths — retención configurable", () => {
  const original = process.env.AUDIT_RETENTION_MONTHS;
  afterEach(() => {
    if (original === undefined) delete process.env.AUDIT_RETENTION_MONTHS;
    else process.env.AUDIT_RETENTION_MONTHS = original;
  });

  it("usa el valor por defecto (6) si no está configurado", () => {
    delete process.env.AUDIT_RETENTION_MONTHS;
    expect(getRetentionMonths()).toBe(DEFAULT_AUDIT_RETENTION_MONTHS);
    expect(DEFAULT_AUDIT_RETENTION_MONTHS).toBe(6);
  });

  it("respeta el valor del entorno cuando es válido", () => {
    process.env.AUDIT_RETENTION_MONTHS = "12";
    expect(getRetentionMonths()).toBe(12);
  });

  it("ignora valores inválidos y cae al defecto", () => {
    process.env.AUDIT_RETENTION_MONTHS = "0";
    expect(getRetentionMonths()).toBe(6);
    process.env.AUDIT_RETENTION_MONTHS = "abc";
    expect(getRetentionMonths()).toBe(6);
  });
});
