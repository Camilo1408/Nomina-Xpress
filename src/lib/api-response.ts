import { NextResponse } from "next/server";

/**
 * Respuestas y lectura de cuerpo comunes a las rutas de la API (CP-49, CP-50).
 *
 * 401 = no hay sesión (hay que iniciar sesión).
 * 403 = hay sesión, pero no tiene el permiso o el rol para esta acción.
 * Antes casi todas las guardias respondían 401 en ambos casos.
 */

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
}

export type JsonBodyResult = { ok: true; body: unknown } | { ok: false; response: NextResponse };

/**
 * Lee el cuerpo JSON sin lanzar: un cuerpo vacío o mal formado responde 400 en vez de
 * un 500 con la traza de `SyntaxError` (CP-49). El cuerpo sale como `unknown`: debe
 * pasar por un schema Zod antes de usarse (regla 4 de CLAUDE.md).
 */
export async function readJsonBody(req: Request): Promise<JsonBodyResult> {
  try {
    return { ok: true, body: (await req.json()) as unknown };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "El cuerpo de la petición no es JSON válido" }, { status: 400 }),
    };
  }
}
