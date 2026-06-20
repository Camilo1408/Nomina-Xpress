import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { ALL_PERMISSION_KEYS, PERMISSIONS } from "@/lib/permission-keys";
import { sessionCan } from "@/lib/get-permissions";

const createSchema = z.object({
  name: z.string().min(2).max(60),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Solo letras minúsculas, números y guiones"),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string()).default([]),
});

export async function GET() {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.ROLES_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  const roles = await prisma.customRole.findMany({
    where: { tenantId },
    include: { _count: { select: { users: true } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return NextResponse.json(roles);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.ROLES_CREATE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, slug, description, permissions } = parsed.data;

  // Validar que las claves de permiso sean válidas
  const validPerms = permissions.filter((p) => ALL_PERMISSION_KEYS.includes(p as never));

  // Slug único por tenant
  const exists = await prisma.customRole.findUnique({ where: { tenantId_slug: { tenantId, slug } } });
  if (exists) {
    return NextResponse.json({ error: { message: "El slug ya está en uso en este tenant" } }, { status: 409 });
  }

  const role = await prisma.customRole.create({
    data: {
      tenantId,
      name,
      slug,
      description: description ?? null,
      permissions: JSON.stringify(validPerms),
    },
  });

  await logAudit(req, session, {
    action: "CREATE",
    module: "ROLES",
    entityId: role.id,
    entityLabel: role.name,
    description: `Creó el rol personalizado "${role.name}" con ${validPerms.length} permiso(s)`,
    after: { name, slug, permissions: validPerms },
  });

  return NextResponse.json(role, { status: 201 });
}
