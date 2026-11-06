import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { unlockLogin } from "@/lib/login-throttle";
import { canRecoverAccess } from "@/lib/password-policy";

/**
 * POST /api/admin/users/[id]/unlock — borra los contadores de intentos fallidos del
 * usuario para que pueda volver a entrar sin esperar a que venza el bloqueo.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canRecoverAccess(session.user.role)) {
    return NextResponse.json(
      { error: "Solo el propietario o un superadmin pueden desbloquear usuarios" },
      { status: 403 },
    );
  }
  const { id } = await params;

  const target = await prisma.user.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, username: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cleared = await unlockLogin(target.username);

  await logAudit(req, session, {
    action: "UPDATE",
    module: "USERS",
    entityId: target.id,
    entityLabel: target.username,
    description: `Desbloqueó el inicio de sesión de "@${target.username}"`,
    after: { contadoresBorrados: cleared },
  });

  return NextResponse.json({ ok: true, cleared });
}
