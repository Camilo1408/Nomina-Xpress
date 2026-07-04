import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

const createSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.enum(["EMPLOYEE", "ADMIN"]).default("EMPLOYEE"),
});

const updateSchema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["EMPLOYEE", "ADMIN"]).optional(),
});

// Create credentials for an employee that has none — SUPERADMIN only
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.EMPLOYEES_CREDENTIALS))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: employeeId } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: session.user.tenantId },
    include: { user: true },
  });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (employee.user) return NextResponse.json({ error: "Already has credentials" }, { status: 409 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const exists = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (exists) return NextResponse.json({ error: "El nombre de usuario ya está en uso" }, { status: 409 });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.create({
    data: {
      tenantId: session.user.tenantId,
      username: parsed.data.username,
      passwordHash,
      role: parsed.data.role,
      employeeId,
    },
  });

  await logAudit(req, session, {
    action: "CREATE",
    module: "CREDENTIALS",
    entityId: employeeId,
    entityLabel: employee.name,
    description: `Creó credenciales de acceso (@${parsed.data.username}, rol ${parsed.data.role}) para "${employee.name}"`,
    after: { username: parsed.data.username, role: parsed.data.role },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

// Update credentials — SUPERADMIN only
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.EMPLOYEES_CREDENTIALS))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: employeeId } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: session.user.tenantId },
    include: { user: true },
  });
  if (!employee || !employee.user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!parsed.data.username && !parsed.data.password && !parsed.data.role) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (parsed.data.username && parsed.data.username !== employee.user.username) {
    const exists = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (exists) return NextResponse.json({ error: "El nombre de usuario ya está en uso" }, { status: 409 });
  }

  const updateData: { username?: string; passwordHash?: string; role?: string } = {};
  if (parsed.data.username) updateData.username = parsed.data.username;
  if (parsed.data.password) updateData.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  if (parsed.data.role) updateData.role = parsed.data.role;

  await prisma.user.update({ where: { id: employee.user.id }, data: updateData });

  const changes: string[] = [];
  if (parsed.data.username) changes.push("usuario");
  if (parsed.data.password) changes.push("contraseña");
  if (parsed.data.role) changes.push("rol");
  await logAudit(req, session, {
    action: "UPDATE",
    module: "CREDENTIALS",
    entityId: employeeId,
    entityLabel: employee.name,
    description: `Actualizó credenciales (${changes.join(", ")}) de "${employee.name}"`,
    before: { username: employee.user.username, role: employee.user.role },
    after: { username: parsed.data.username ?? employee.user.username, role: parsed.data.role ?? employee.user.role },
  });

  return NextResponse.json({ success: true });
}
