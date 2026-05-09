import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";

const schema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  currentPassword: z.string().min(1),
});

export async function PUT(req: Request) {
  const session = await auth();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (!parsed.data.username && !parsed.data.password) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  // ADMIN cannot change username — only SUPERADMIN can
  if (parsed.data.username && session.user.role === "ADMIN") {
    return NextResponse.json({ error: "Sin permisos para cambiar el usuario" }, { status: 403 });
  }

  // Find own user record — session.user.name stores the username (set in authorize callback)
  const user = await prisma.user.findFirst({
    where: { username: session.user.name ?? "", tenantId: session.user.tenantId },
  });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  // Verify current password
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 401 });

  if (parsed.data.username && parsed.data.username !== user.username) {
    const exists = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (exists) return NextResponse.json({ error: "El nombre de usuario ya está en uso" }, { status: 409 });
  }

  const updateData: { username?: string; passwordHash?: string } = {};
  if (parsed.data.username) updateData.username = parsed.data.username;
  if (parsed.data.password) updateData.passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.user.update({ where: { id: user.id }, data: updateData });

  return NextResponse.json({ success: true });
}
