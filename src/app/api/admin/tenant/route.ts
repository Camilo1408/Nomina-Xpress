import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { forbidden, readJsonBody, unauthorized } from "@/lib/api-response";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.SETTINGS_VIEW))) return forbidden();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId } });
  return NextResponse.json(tenant);
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.SETTINGS_EDIT))) return forbidden();
  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.response;
  const body = raw.body;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const before = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true, primaryColor: true, secondaryColor: true },
  });
  const tenant = await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: parsed.data,
  });

  await logAudit(req, session, {
    action: "UPDATE",
    module: "SETTINGS",
    entityId: tenant.id,
    entityLabel: tenant.name,
    description: `Actualizó la configuración del restaurante`,
    before: before ?? undefined,
    after: parsed.data,
  });

  return NextResponse.json(tenant);
}
