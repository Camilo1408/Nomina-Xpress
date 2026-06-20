import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { ALL_PERMISSION_KEYS, PERMISSIONS } from "@/lib/permission-keys";
import { sessionCan } from "@/lib/get-permissions";

const updateSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(200).nullable().optional(),
  permissions: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.ROLES_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const role = await prisma.customRole.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      users: { select: { id: true, username: true, role: true, active: true, employee: { select: { name: true } } } },
      _count: { select: { users: true } },
    },
  });
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(role);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.ROLES_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { tenantId } = session.user;

  const existing = await prisma.customRole.findFirst({ where: { id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.isSystem) {
    return NextResponse.json({ error: "Los roles del sistema no se pueden editar" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.permissions !== undefined) {
    data.permissions = JSON.stringify(
      parsed.data.permissions.filter((p) => ALL_PERMISSION_KEYS.includes(p as never))
    );
  }
  if (parsed.data.active !== undefined) data.active = parsed.data.active;

  const updated = await prisma.customRole.update({ where: { id }, data });

  const isToggle = parsed.data.active !== undefined && parsed.data.active !== existing.active;
  await logAudit(req, session, {
    action: isToggle ? (parsed.data.active ? "ACTIVATE" : "DEACTIVATE") : "UPDATE",
    module: "ROLES",
    entityId: id,
    entityLabel: existing.name,
    description: isToggle
      ? `${parsed.data.active ? "Activó" : "Desactivó"} el rol "${existing.name}"`
      : `Editó el rol "${existing.name}"`,
    before: { name: existing.name, permissions: existing.permissions, active: existing.active },
    after: data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.ROLES_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { tenantId } = session.user;

  const existing = await prisma.customRole.findFirst({
    where: { id, tenantId },
    include: { _count: { select: { users: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.isSystem) {
    return NextResponse.json({ error: "Los roles del sistema no se pueden eliminar" }, { status: 403 });
  }

  if (existing._count.users > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: ${existing._count.users} usuario(s) tienen este rol asignado` },
      { status: 409 }
    );
  }

  await prisma.customRole.delete({ where: { id } });

  await logAudit(req, session, {
    action: "DELETE",
    module: "ROLES",
    entityId: id,
    entityLabel: existing.name,
    description: `Eliminó el rol "${existing.name}"`,
    before: { name: existing.name },
  });

  return NextResponse.json({ success: true });
}
