import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { grantAboveResponse, loadDelegationContext, permissionsOf, ungrantable } from "@/lib/delegation";
import { PERMISSIONS } from "@/lib/permission-keys";
import { newPasswordSchema } from "@/lib/password-policy";
import { forbidden, readJsonBody, unauthorized } from "@/lib/api-response";

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
  password: z.preprocess((v) => (v === "" ? undefined : v), newPasswordSchema.optional()),
}).refine((d) => d.accessRole === "NONE" || (!!d.username && !!d.password), {
  // Antes se creaba el empleado SIN acceso en silencio si faltaba alguno de los dos.
  message: "Para dar acceso al portal indica usuario y contraseña",
  path: ["username"],
});

const USERNAME_TAKEN = "El nombre de usuario ya está en uso";

const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.EMPLOYEES_VIEW))) return forbidden();
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.user.tenantId },
    include: { user: { select: { username: true, role: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(employees);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.EMPLOYEES_CREATE))) return forbidden();
  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.response;
  const body = raw.body;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { accessRole, username, password, ...empData } = parsed.data;

  // RN-20: no se crea un acceso con más permisos que los de quien lo crea.
  if (accessRole !== "NONE") {
    const above = ungrantable(
      await loadDelegationContext(session),
      permissionsOf({ role: accessRole }, session.user.tenantId),
    );
    if (above.length) return grantAboveResponse(above);
  }

  // RN-21: el usuario se valida ANTES de crear nada, y empleado + acceso se crean en
  // una sola transacción. Antes el empleado quedaba creado (huérfano, sin acceso)
  // cuando el usuario ya existía y la respuesta era 409.
  const withAccess = accessRole !== "NONE" && username && password ? { username, password } : null;
  if (withAccess && (await prisma.user.findUnique({ where: { username: withAccess.username } }))) {
    return NextResponse.json({ error: USERNAME_TAKEN }, { status: 409 });
  }
  const passwordHash = withAccess ? await bcrypt.hash(withAccess.password, 12) : null;

  let employee;
  try {
    employee = await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: { ...empData, tenantId: session.user.tenantId },
      });
      if (withAccess && passwordHash) {
        await tx.user.create({
          data: {
            tenantId: session.user.tenantId,
            username: withAccess.username,
            passwordHash,
            role: accessRole,
            employeeId: created.id,
          },
        });
      }
      return created;
    });
  } catch (err) {
    // Carrera: otro alta tomó el mismo usuario entre la consulta y la transacción;
    // la transacción se deshizo, así que tampoco queda el empleado.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: USERNAME_TAKEN }, { status: 409 });
    }
    throw err;
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
