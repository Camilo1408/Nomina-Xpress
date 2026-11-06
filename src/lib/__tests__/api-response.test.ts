// CP-49 / CP-50: lectura segura del cuerpo y 401 frente a 403.

import { describe, it, expect } from "vitest";
import { forbidden, readJsonBody, unauthorized } from "../api-response";

const req = (body?: string) =>
  new Request("http://localhost/api/x", { method: "POST", body, headers: { "content-type": "application/json" } });

describe("readJsonBody", () => {
  it("[CP-49] JSON válido ⇒ ok con el cuerpo", async () => {
    await expect(readJsonBody(req('{"a":1}'))).resolves.toEqual({ ok: true, body: { a: 1 } });
  });

  it("[CP-49][NEG] JSON mal formado ⇒ 400, no lanza", async () => {
    const r = await readJsonBody(req("{a:"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      await expect(r.response.json()).resolves.toEqual({ error: "El cuerpo de la petición no es JSON válido" });
    }
  });

  it("[CP-49][NEG][LIM] cuerpo vacío ⇒ 400", async () => {
    const r = await readJsonBody(req());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });
});

describe("unauthorized / forbidden", () => {
  it("[CP-50] sin sesión ⇒ 401; sin permiso ⇒ 403 con mensaje legible", async () => {
    expect(unauthorized().status).toBe(401);
    const f = forbidden();
    expect(f.status).toBe(403);
    await expect(f.json()).resolves.toEqual({ error: "No tienes permiso para esta acción" });
  });
});
