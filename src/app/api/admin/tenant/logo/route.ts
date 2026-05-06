import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink, readdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = () => path.join(process.cwd(), "public", "uploads", "logos");

async function deleteExistingLogoFiles(tenantId: string) {
  try {
    const dir = UPLOAD_DIR();
    const files = await readdir(dir);
    await Promise.all(
      files
        .filter((f) => f.startsWith(tenantId + "."))
        .map((f) => unlink(path.join(dir, f)).catch(() => {}))
    );
  } catch {
    // directory may not exist yet — ignore
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["jpg", "jpeg", "png", "svg", "webp"].includes(ext ?? "")) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  const dir = UPLOAD_DIR();
  await mkdir(dir, { recursive: true });

  // Delete any previously saved logo files for this tenant (all extensions)
  await deleteExistingLogoFiles(session.user.tenantId);

  const filename = `${session.user.tenantId}.${ext}`;
  const bytes = await file.arrayBuffer();
  await writeFile(path.join(dir, filename), Buffer.from(bytes));

  // Append cache-busting version so browser always fetches the new file
  const logoUrl = `/uploads/logos/${filename}?v=${Date.now()}`;
  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { logoUrl },
  });

  return NextResponse.json({ logoUrl });
}

export async function DELETE() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteExistingLogoFiles(session.user.tenantId);

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { logoUrl: null },
  });

  return NextResponse.json({ success: true });
}
