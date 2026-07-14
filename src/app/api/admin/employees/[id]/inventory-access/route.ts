import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@/lib/permission-keys";

// Claves que este toggle otorga como "baseline operativo" (ver resolveInventoryPermissions
// en auth.ts). Se mantienen como overrides individuales espejo para que la matriz de
// permisos granulares (Auto/Sí/No) refleje el mismo estado sin tener que ir a editarla
// aparte — un solo cambio, visible en ambos lugares.
const MIRRORED_KEYS = [PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.INVENTORY_STOCK_COUNT] as const;

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

  // Espejo en la matriz de permisos individuales: al habilitar, quedan como
  // "Sí" (override explícito); al deshabilitar, se quita el override y vuelve
  // a "Auto" (no revoca un acceso que ya viniera del rol, igual que antes).
  if (parsed.data.inventoryAccess) {
    for (const permissionKey of MIRRORED_KEYS) {
      await prisma.userPermission.upsert({
        where: { userId_permissionKey: { userId: user.id, permissionKey } },
        create: { tenantId: session.user.tenantId, userId: user.id, permissionKey, granted: true },
        update: { granted: true },
      });
    }
  } else {
    await prisma.userPermission.deleteMany({
      where: { userId: user.id, permissionKey: { in: [...MIRRORED_KEYS] } },
    });
  }

  return NextResponse.json(updated);
}
