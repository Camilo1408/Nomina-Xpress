// Webhook PUSH del inventario → Nómina.
// El inventario lo invoca (best-effort) al crear una categoría raíz:
//   POST /api/inventory-permissions/sync
//   x-sync-secret: <NOMINA_SYNC_SECRET>
//   { event, category: {slug, name}, keys: [...], assignToRoles: [...] }
//
// Es server-to-server (sin cookie de sesión): se autentica con un secreto
// compartido. La reconciliación por pull (syncInventoryCategories) cubre el hueco
// si este webhook falla, así que respondemos rápido y tolerante.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { upsertCategoryFromPush } from "@/lib/inventory-sync";

const payloadSchema = z.object({
  event: z.literal("inventory.category.created"),
  category: z.object({
    slug: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9-]+$/, "slug inválido"),
    name: z.string().min(1).max(80),
  }),
  keys: z.array(z.string()).optional(),
  assignToRoles: z.array(z.string()).optional(),
});

/** Comparación en tiempo constante de dos secretos (evita timing attacks). */
function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: Request) {
  // 1. Autenticación por secreto compartido.
  const expected = process.env.NOMINA_SYNC_SECRET;
  if (!expected) {
    // Sin secreto configurado el endpoint quedaría abierto → lo rechazamos.
    return NextResponse.json(
      { error: "Webhook no configurado (falta NOMINA_SYNC_SECRET)" },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-sync-secret") ?? "";
  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validación del payload.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // 3. Resolución del tenant (modo single-tenant local/integrado): el payload no
  //    trae tenantId, así que upsertamos sobre el único tenant. Si hubiera varios,
  //    no podemos desambiguar sin tenantId → 409 (la guía contempla sumar tenantId).
  const tenants = await prisma.tenant.findMany({ select: { id: true }, take: 2 });
  if (tenants.length === 0) {
    return NextResponse.json({ error: "No hay tenant configurado" }, { status: 404 });
  }
  if (tenants.length > 1) {
    return NextResponse.json(
      { error: "Múltiples tenants: el webhook requiere tenantId en el payload" },
      { status: 409 }
    );
  }

  // 4. Upsert idempotente del espejo de categorías. Los roles privilegiados
  //    obtienen la nueva categoría al re-loguear (claves derivadas del espejo).
  await upsertCategoryFromPush(tenants[0].id, parsed.data.category);

  return NextResponse.json({ ok: true, slug: parsed.data.category.slug });
}
