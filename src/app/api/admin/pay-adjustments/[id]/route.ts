import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

const updateSchema = z.object({
  type: z.enum(["DISCOUNT", "BONUS"]),
  amount: z.number().positive(),
  description: z.string().min(1),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.PAY_ADJUSTMENTS_EDIT))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const before = await prisma.payAdjustment.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });

  await prisma.payAdjustment.updateMany({
    where: { id, tenantId: session.user.tenantId },
    data: parsed.data,
  });

  await logAudit(req, session, {
    action: "UPDATE",
    module: "PAY_ADJUSTMENTS",
    entityId: id,
    entityLabel: before?.description ?? id,
    description: `Editó un ${
      parsed.data.type === "BONUS" ? "bono" : "descuento"
    } por ${parsed.data.amount} (${parsed.data.description})`,
    before: before ?? undefined,
    after: { ...before, ...parsed.data },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.PAY_ADJUSTMENTS_DELETE))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const before = await prisma.payAdjustment.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  await prisma.payAdjustment.deleteMany({ where: { id, tenantId: session.user.tenantId } });

  if (before) {
    await logAudit(req, session, {
      action: "DELETE",
      module: "PAY_ADJUSTMENTS",
      entityId: id,
      entityLabel: before.description,
      description: `Eliminó un ${
        before.type === "BONUS" ? "bono" : "descuento"
      } de ${before.amount} (${before.description})`,
      before,
    });
  }

  return NextResponse.json({ success: true });
}
