import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "../csp";

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("buildCsp (H10)", () => {
  it("con nonce, los scripts solo corren con el nonce y lo que ellos cargan", () => {
    const csp = buildCsp({ nonce: "abc123" });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it("[NEG] en producción no hay 'unsafe-inline' ni 'unsafe-eval' en script-src", () => {
    for (const csp of [buildCsp({ nonce: "n" }), buildCsp()]) {
      const script = directive(csp, "script-src");
      expect(script).not.toContain("unsafe-inline");
      expect(script).not.toContain("unsafe-eval");
    }
  });

  it("sin nonce (API y archivos) no se permite ningún script en línea", () => {
    expect(directive(buildCsp(), "script-src")).toBe("script-src 'self'");
  });

  it("'unsafe-eval' solo aparece en desarrollo", () => {
    expect(directive(buildCsp({ nonce: "n", dev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("conserva el resto de la política", () => {
    const csp = buildCsp({ nonce: "n" });
    for (const d of [
      "default-src 'self'",
      "img-src 'self' data: blob: https://res.cloudinary.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]) {
      expect(csp.split("; ")).toContain(d);
    }
  });
});

describe("createNonce", () => {
  it("genera 16 bytes en base64, distintos cada vez", () => {
    const nonces = new Set(Array.from({ length: 200 }, createNonce));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    }
  });
});
