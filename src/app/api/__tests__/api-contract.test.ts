// Compuerta estática sobre TODAS las rutas de la API (CP-49, CP-50). Falla si una
// ruta nueva vuelve a los patrones viejos:
//   - `await req.json()` sin guarda (un cuerpo mal formado daba 500);
//   - `if (!session || !permiso) → 401` (sin permiso debe ser 403).

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const API_DIR = path.resolve(__dirname, "..");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

const routes = routeFiles(API_DIR).map((file) => ({
  file: path.relative(API_DIR, file).replace(/\\/g, "/"),
  src: readFileSync(file, "utf8"),
}));

// El webhook de sincronización ya lee el cuerpo dentro de su propio try/catch.
const BODY_ALLOWLIST = new Set(["inventory-permissions/sync/route.ts"]);

describe("contrato de las rutas de la API", () => {
  it("encuentra las rutas (la compuerta no pasa en vacío)", () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it("[CP-49] ningún `await req.json()` sin guarda: usar readJsonBody o .catch()", () => {
    const offenders = routes
      .filter((r) => !BODY_ALLOWLIST.has(r.file))
      .filter((r) => /await\s+(req|request)\.json\(\)(?!\s*\.catch)/.test(r.src))
      .map((r) => r.file);
    expect(offenders).toEqual([]);
  });

  it("[CP-50] ninguna guardia mezcla «sin sesión» y «sin permiso» en un 401", () => {
    const mixed = /if \(!session \|\|[^\n]*\)\s*\{?\s*\n?\s*return [^\n]*status:\s*401/;
    const offenders = routes.filter((r) => mixed.test(r.src)).map((r) => r.file);
    expect(offenders).toEqual([]);
  });
});
