import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { newPasswordSchema } from "@/lib/password-policy";
import { grantAboveResponse, loadDelegationContext, permissionsOf, ungrantable } from "@/lib/delegation";
import { forbidden, readJsonBody, unauthorized } from "@/lib/api-response";

const createSchema = z.object({
  username: z.string().min(3).max(40),
  password: newPasswordSchema,
  role: z.enum(["ADMIN", "SUPERADMIN"]),
  customRoleId: z.string().nullable().optional(),
  // null = usuario solo del sistema (no pagable)
  // string = employeeId para vincular a un empleado existente
  employeeId: z.string().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.USERS_VIEW))) return forbidden();
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
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.USERS_CREATE))) return forbidden();
  const { tenantId } = session.user;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.response;
  const body = raw.body;
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
  let customRole: { permissions: string; active: boolean; tenantId: string } | null = null;
  if (customRoleId) {
    const cr = await prisma.customRole.findFirst({ where: { id: customRoleId, tenantId } });
    if (!cr) return NextResponse.json({ error: "Rol personalizado no encontrado" }, { status: 400 });
    customRole = cr;
  }

  // RN-20: no se crea un usuario con más permisos que los de quien lo crea.
  const above = ungrantable(
    await loadDelegationContext(session),
    permissionsOf({ role, customRole }, tenantId),
  );
  if (above.length) return grantAboveResponse(above);

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
