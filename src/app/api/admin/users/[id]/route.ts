import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

const updateSchema = z.object({
  role: z.enum(["ADMIN", "SUPERADMIN"]).optional(),
  customRoleId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.USERS_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const user = await prisma.user.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      employee: { select: { id: true, name: true, active: true } },
      customRole: { select: { id: true, name: true, active: true } },
      userPermissions: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // No exponer passwordHash
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph, ...safe } = user;
  return NextResponse.json(safe);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.USERS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { tenantId } = session.user;

  const target = await prisma.user.findFirst({ where: { id, tenantId } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Proteger el PROPRIETARY: nadie puede modificarlo
  if (target.role === "PROPRIETARY") {
    return NextResponse.json({ error: "No se puede modificar el usuario PROPRIETARY" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.customRoleId !== undefined) data.customRoleId = parsed.data.customRoleId;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  if (parsed.data.customRoleId) {
    const cr = await prisma.customRole.findFirst({ where: { id: parsed.data.customRoleId, tenantId } });
    if (!cr) return NextResponse.json({ error: "Rol personalizado no encontrado" }, { status: 400 });
  }

  const updated = await prisma.user.update({ where: { id }, data });

  const isToggle = parsed.data.active !== undefined && parsed.data.active !== target.active;
  await logAudit(req, session, {
    action: isToggle ? (parsed.data.active ? "ACTIVATE" : "DEACTIVATE") : "UPDATE",
    module: "USERS",
    entityId: id,
    entityLabel: target.username,
    description: isToggle
      ? `${parsed.data.active ? "Activó" : "Desactivó"} el usuario "@${target.username}"`
      : `Editó el usuario "@${target.username}"`,
    before: { role: target.role, customRoleId: target.customRoleId, active: target.active },
    after: data,
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph2, ...safe } = updated;
  return NextResponse.json(safe);
}
