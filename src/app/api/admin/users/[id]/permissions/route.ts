import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { isValidPermissionKey, PERMISSIONS } from "@/lib/permission-keys";
import { sessionCan } from "@/lib/get-permissions";

const upsertSchema = z.object({
  permissionKey: z.string(),
  granted: z.boolean(),
});

const bulkSchema = z.object({
  // Array de {permissionKey, granted} para upsert masivo
  overrides: z.array(upsertSchema),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.USERS_MANAGE_PERMISSIONS))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const user = await prisma.user.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      userPermissions: { orderBy: { permissionKey: "asc" } },
      customRole: { select: { permissions: true, active: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    role: user.role,
    customRolePermissions: user.customRole?.active
      ? (JSON.parse(user.customRole.permissions) as string[])
      : null,
    userPermissions: user.userPermissions,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.USERS_MANAGE_PERMISSIONS))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { tenantId } = session.user;

  const target = await prisma.user.findFirst({ where: { id, tenantId } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (target.role === "PROPRIETARY") {
    return NextResponse.json({ error: "No se pueden modificar permisos del PROPRIETARY" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const validOverrides = parsed.data.overrides.filter(
    (o) => isValidPermissionKey(o.permissionKey)
  );

  // Upsert cada override
  for (const override of validOverrides) {
    await prisma.userPermission.upsert({
      where: { userId_permissionKey: { userId: id, permissionKey: override.permissionKey } },
      create: {
        tenantId,
        userId: id,
        permissionKey: override.permissionKey,
        granted: override.granted,
      },
      update: { granted: override.granted },
    });
  }

  await logAudit(req, session, {
    action: "UPDATE",
    module: "USERS",
    entityId: id,
    entityLabel: target.username,
    description: `Actualizó ${validOverrides.length} permiso(s) individuales del usuario "@${target.username}"`,
    after: { overrides: validOverrides },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.USERS_MANAGE_PERMISSIONS))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { tenantId } = session.user;

  const target = await prisma.user.findFirst({ where: { id, tenantId } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const schema = z.object({ permissionKey: z.string().optional() });
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);

  if (parsed.success && parsed.data.permissionKey) {
    // Eliminar un override específico
    await prisma.userPermission.deleteMany({
      where: { userId: id, permissionKey: parsed.data.permissionKey },
    });
  } else {
    // Eliminar TODOS los overrides del usuario
    await prisma.userPermission.deleteMany({ where: { userId: id } });
  }

  await logAudit(req, session, {
    action: "UPDATE",
    module: "USERS",
    entityId: id,
    entityLabel: target.username,
    description: parsed.success && parsed.data.permissionKey
      ? `Quitó el permiso individual "${parsed.data.permissionKey}" del usuario "@${target.username}"`
      : `Eliminó todos los permisos individuales del usuario "@${target.username}"`,
  });

  return NextResponse.json({ success: true });
}
