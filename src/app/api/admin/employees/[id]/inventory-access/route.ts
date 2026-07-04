import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ inventoryAccess: z.boolean() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !["SUPERADMIN", "PROPRIETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id: employeeId } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { employeeId, tenantId: session.user.tenantId },
  });

  if (!user) {
    return NextResponse.json(
      { error: "El empleado no tiene cuenta de acceso al sistema" },
      { status: 404 }
    );
  }

  if (user.role === "SUPERADMIN" || user.role === "PROPRIETARY") {
    return NextResponse.json(
      { error: "No se puede modificar el acceso de este rol" },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { inventoryAccess: parsed.data.inventoryAccess },
    select: { id: true, inventoryAccess: true },
  });

  return NextResponse.json(updated);
}
