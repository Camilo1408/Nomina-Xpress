import { describe, it, expect } from "vitest";
import { getClientInfo } from "../audit";
import {
  AUDIT_ACTIONS,
  AUDIT_MODULES,
  ACTION_LABELS,
  MODULE_LABELS,
} from "../audit-labels";

describe("getClientInfo", () => {
  it("extrae la primera IP de x-forwarded-for", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8", "user-agent": "UA" },
    });
    expect(getClientInfo(req)).toEqual({ ip: "1.2.3.4", userAgent: "UA" });
  });

  it("usa x-real-ip como respaldo", () => {
    const req = new Request("http://x", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(getClientInfo(req).ip).toBe("9.9.9.9");
  });

  it("devuelve null cuando no hay headers de IP/UA", () => {
    const req = new Request("http://x");
    expect(getClientInfo(req)).toEqual({ ip: null, userAgent: null });
  });
});

describe("etiquetas de auditoría", () => {
  it("toda acción tiene etiqueta legible", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(ACTION_LABELS[action]).toBeTruthy();
    }
  });

  it("todo módulo tiene etiqueta legible", () => {
    for (const mod of AUDIT_MODULES) {
      expect(MODULE_LABELS[mod]).toBeTruthy();
    }
  });
});
