import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

const createSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "SUPERADMIN"]),
  customRoleId: z.string().nullable().optional(),
  // null = usuario solo del sistema (no pagable)
  // string = employeeId para vincular a un empleado existente
  employeeId: z.string().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.USERS_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  const users = await prisma.user.findMany({
    where: { tenantId },
    include: {
      employee: { select: { name: true, active: true } },
      customRole: { select: { id: true, name: true, active: true } },
    },
    orderBy: { username: "asc" },
  });

  return NextResponse.json(users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    active: u.active,
    employeeId: u.employeeId,
    employeeName: u.employee?.name ?? null,
    employeeActive: u.employee?.active ?? null,
    customRoleId: u.customRoleId,
    customRoleName: u.customRole?.name ?? null,
    createdAt: u.createdAt,
  })));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.USERS_CREATE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { username, password, role, customRoleId, employeeId } = parsed.data;

  // Verificar username único
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: { message: "El nombre de usuario ya está en uso" } }, { status: 409 });
  }

  // Si se especifica un customRole, verificar que pertenece al tenant
  if (customRoleId) {
    const cr = await prisma.customRole.findFirst({ where: { id: customRoleId, tenantId } });
    if (!cr) return NextResponse.json({ error: "Rol personalizado no encontrado" }, { status: 400 });
  }

  // Si se vincula a un empleado, verificar que pertenece al tenant y no tiene usuario ya
  if (employeeId) {
    const emp = await prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
    if (!emp) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 400 });
    const hasUser = await prisma.user.findFirst({ where: { employeeId } });
    if (hasUser) return NextResponse.json({ error: "El empleado ya tiene un usuario asignado" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      tenantId,
      username,
      passwordHash,
      role,
      customRoleId: customRoleId ?? null,
      employeeId: employeeId ?? null,
    },
  });

  await logAudit(req, session, {
    action: "CREATE",
    module: "USERS",
    entityId: user.id,
    entityLabel: username,
    description: `Creó el usuario de portal "@${username}" con rol ${role}${
      employeeId ? "" : " (sin empleado pagable)"
    }`,
    after: { username, role, employeeId, customRoleId },
  });

  return NextResponse.json({ id: user.id, username: user.username, role: user.role }, { status: 201 });
}
