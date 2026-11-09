import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { sessionRevocationData } from "@/lib/session-guard";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { newPasswordSchema, canRecoverAccess } from "@/lib/password-policy";
import {
  checkTargetChange,
  loadDelegationContext,
  PERMISSION_HOLDER_INCLUDE,
  selfChangeResponse,
} from "@/lib/delegation";
import { clearLoginLock } from "@/lib/login-throttle";
import { forbidden, readJsonBody, unauthorized } from "@/lib/api-response";

const updateSchema = z.object({
  role: z.enum(["ADMIN", "SUPERADMIN"]).optional(),
  customRoleId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  password: newPasswordSchema.optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.USERS_VIEW))) return forbidden();
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
  if (!session) return unauthorized();
  const { id } = await params;
  const { tenantId } = session.user;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.response;
  const body = raw.body;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // users:edit edita todo. Sin él, PROPRIETARY y SUPERADMIN pueden igual restablecer
  // la contraseña (recuperación de acceso, CP-45), y nada más.
  const changesAccess =
    parsed.data.role !== undefined || parsed.data.customRoleId !== undefined || parsed.data.active !== undefined;
  const passwordOnly = !!parsed.data.password && !changesAccess;
  if (
    !(await sessionCan(session, PERMISSIONS.USERS_EDIT)) &&
    !(passwordOnly && canRecoverAccess(session.user.role))
  ) {
    return forbidden(); // con sesión pero sin permiso: 403, no 401 (CP-50)
  }

  const target = await prisma.user.findFirst({ where: { id, tenantId }, include: PERMISSION_HOLDER_INCLUDE });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Proteger el PROPRIETARY: nadie puede modificarlo
  if (target.role === "PROPRIETARY") {
    return NextResponse.json({ error: "No se puede modificar el usuario PROPRIETARY" }, { status: 403 });
  }

  // RN-20 (CP-47): nadie se cambia a sí mismo el rol, el rol personalizado ni el estado.
  if (target.id === session.user.id && changesAccess) return selfChangeResponse();
  // La contraseña propia se cambia en Mi perfil, que exige la actual: así una sesión
  // robada no puede fijar una clave nueva sin conocer la vigente.
  if (target.id === session.user.id && parsed.data.password) {
    return NextResponse.json(
      { error: "Cambia tu propia contraseña desde Mi perfil" },
      { status: 403 },
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.customRoleId !== undefined) data.customRoleId = parsed.data.customRoleId;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  let newCustomRole: { permissions: string; active: boolean; tenantId: string } | null = null;
  if (parsed.data.customRoleId) {
    const cr = await prisma.customRole.findFirst({ where: { id: parsed.data.customRoleId, tenantId } });
    if (!cr) return NextResponse.json({ error: "Rol personalizado no encontrado" }, { status: 400 });
    newCustomRole = cr;
  }

  // RN-20 (CP-48): el usuario, antes y después del cambio, debe quedar dentro de los
  // permisos de quien lo edita (solo el PROPRIETARY no tiene techo).
  const denied = checkTargetChange(
    await loadDelegationContext(session),
    target,
    {
      role: parsed.data.role ?? target.role,
      customRole: parsed.data.customRoleId !== undefined ? newCustomRole : target.customRole,
      userPermissions: target.userPermissions,
    },
    tenantId,
  );
  if (denied) return denied;

  // RN-19: desactivar, cambiar la contraseña, el rol base o el rol personalizado
  // cierra las sesiones abiertas del usuario en su siguiente request.
  const revokes =
    (parsed.data.active === false && target.active) ||
    !!parsed.data.password ||
    (parsed.data.role !== undefined && parsed.data.role !== target.role) ||
    (parsed.data.customRoleId !== undefined && parsed.data.customRoleId !== target.customRoleId);

  const updated = await prisma.user.update({
    where: { id },
    data: revokes ? { ...data, ...sessionRevocationData() } : data,
  });
  // CP-45: una contraseña nueva levanta el bloqueo por intentos fallidos.
  if (parsed.data.password) await clearLoginLock(target.username);

  // La auditoría nunca guarda el hash de la contraseña, solo que cambió.
  const { passwordHash: _hash, ...auditAfter } = data;

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
    after: { ...auditAfter, ...(_hash ? { password: "(cambiada)" } : {}), ...(revokes ? { sesionesRevocadas: true } : {}) },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph2, ...safe } = updated;
  return NextResponse.json(safe);
}
