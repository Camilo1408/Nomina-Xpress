import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

const createSchema = z.object({
  name: z.string().min(2),
  documentId: z.string().optional(),
  phone: z.string().optional(),
  hourlyRateNormal: z.number().positive().default(6900),
  hourlyRateSpecial: z.number().positive().default(11400),
  tipPercent: z.number().min(0).max(100).default(100),
  payType: z.enum(["PAYROLL", "SHIFT"]).default("PAYROLL"),
  accessRole: z.enum(["NONE", "EMPLOYEE", "ADMIN"]).default("NONE"),
  username: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(3).optional()),
  password: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(6).optional()),
});

export async function GET() {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.EMPLOYEES_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.user.tenantId },
    include: { user: { select: { username: true, role: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(employees);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.EMPLOYEES_CREATE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { accessRole, username, password, ...empData } = parsed.data;

  const employee = await prisma.employee.create({
    data: { ...empData, tenantId: session.user.tenantId },
  });

  if (accessRole !== "NONE" && username && password) {
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json(
        { error: { message: "El nombre de usuario ya está en uso" } },
        { status: 409 }
      );
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        tenantId: session.user.tenantId,
        username,
        passwordHash,
        role: accessRole,
        employeeId: employee.id,
      },
    });
  }

  await logAudit(req, session, {
    action: "CREATE",
    module: "EMPLOYEES",
    entityId: employee.id,
    entityLabel: employee.name,
    description: `Creó el empleado "${employee.name}"${
      accessRole !== "NONE" && username ? ` con acceso ${accessRole} (@${username})` : ""
    }`,
    after: { ...empData, accessRole },
  });

  return NextResponse.json(employee, { status: 201 });
}
