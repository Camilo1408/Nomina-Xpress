// Verificación de sesión para Inventory Xpress (I-H1b, RN-19).
//
// Server-to-server, sin cookie: Inventory cifra con el NEXTAUTH_SECRET compartido
// un token corto con los datos de la sesión que está atendiendo y lo envía:
//
//   POST /api/inventory-permissions/session
//   Authorization: Bearer <JWE con sal SESSION_CHECK_SALT y { id, tenantId, sv }>
//
// Respuesta 200:
//   { valid: false }                                       → cerrar la sesión allá
//   { valid: true, role, inventoryAccess, inventoryPermissions } → permisos frescos
//
// 401 si el token no descifra con esa sal o expiró; 400 si no trae id/tenantId.

import { NextResponse } from "next/server";
import { decode } from "next-auth/jwt";
import { z } from "zod";
import { resolveSessionState, SESSION_CHECK_SALT } from "@/lib/session-state";

const claimsSchema = z.object({
  id: z.string().min(1).max(100),
  tenantId: z.string().min(1).max(100),
  // La versión la valida isTokenStillValid (undefined = token anterior a RN-19).
  sv: z.unknown().optional(),
});

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Falta NEXTAUTH_SECRET" }, { status: 503, headers: NO_STORE });
  }

  const match = /^Bearer\s+(\S+)$/.exec(req.headers.get("authorization") ?? "");
  if (!match) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let claims: unknown = null;
  try {
    claims = await decode({ token: match[1], secret, salt: SESSION_CHECK_SALT });
  } catch {
    claims = null; // cifrado con otra sal o secreto, alterado o expirado
  }
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const parsed = claimsSchema.safeParse(claims);
  if (!parsed.success) {
    return NextResponse.json({ error: "Token sin id o tenantId" }, { status: 400, headers: NO_STORE });
  }

  const { id, tenantId, sv } = parsed.data;
  const state = await resolveSessionState(id, tenantId, sv);
  return NextResponse.json(state, { headers: NO_STORE });
}
