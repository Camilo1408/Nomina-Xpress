import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import fs from "fs/promises";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { forbidden, unauthorized } from "@/lib/api-response";
import { LOGO_MAX_BYTES, detectLogoType } from "@/lib/logo-validation";

const cloudinaryConfigured =
  !!process.env.CLOUDINARY_CLOUD_NAME &&
  !!process.env.CLOUDINARY_API_KEY &&
  !!process.env.CLOUDINARY_API_SECRET;

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Extract Cloudinary public_id from a stored URL
function extractPublicId(url: string): string | null {
  // URL format: https://res.cloudinary.com/<cloud>/image/upload/v.../nomina-xpress/<id>.ext
  const match = url.match(/nomina-xpress\/([^.?]+)/);
  return match ? `nomina-xpress/${match[1]}` : null;
}

// Returns the absolute filesystem path under /public/uploads matching a stored local URL,
// or null if the URL isn't a local upload.
function localPathFromUrl(url: string): string | null {
  if (!url.startsWith("/uploads/")) return null;
  const rel = url.replace(/^\/+/, ""); // "uploads/<file>"
  return path.join(process.cwd(), "public", rel);
}

async function deletePreviousLogo(logoUrl: string | null | undefined) {
  if (!logoUrl) return;
  if (cloudinaryConfigured && logoUrl.startsWith("http")) {
    const publicId = extractPublicId(logoUrl);
    if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => null);
    return;
  }
  const local = localPathFromUrl(logoUrl);
  if (local) await fs.unlink(local).catch(() => null);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.SETTINGS_EDIT))) return forbidden();

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
  }

  if (file.size > LOGO_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo debe pesar menos de 2 MB" }, { status: 400 });
  }

  // H9 / CP-51: el formato sale de los bytes del archivo, no de su nombre. Se valida antes
  // de borrar el logo anterior, para que un archivo rechazado no deje al cliente sin logo.
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = detectLogoType(buffer);
  if (!ext) {
    return NextResponse.json({ error: "El logo debe ser una imagen PNG, JPG o WEBP" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { logoUrl: true },
  });

  await deletePreviousLogo(tenant?.logoUrl);

  let logoUrl: string;

  if (cloudinaryConfigured) {
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: "nomina-xpress",
            public_id: session.user.tenantId,
            overwrite: true,
            resource_type: "image",
          },
          (err, res) => {
            if (err || !res) return reject(err ?? new Error("Upload failed"));
            resolve(res as { secure_url: string });
          }
        )
        .end(buffer);
    });
    logoUrl = result.secure_url;
  } else {
    // Fallback local: guarda en /public/uploads/<tenantId>.<ext>
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    const filename = `${session.user.tenantId}.${ext}`;
    await fs.writeFile(path.join(uploadsDir, filename), buffer);
    // Cache-buster con timestamp para que el browser recargue tras reemplazo.
    logoUrl = `/uploads/${filename}?v=${Date.now()}`;
  }

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { logoUrl },
  });

  await logAudit(req, session, {
    action: "UPDATE",
    module: "SETTINGS",
    entityId: session.user.tenantId,
    description: `Actualizó el logo del restaurante`,
  });

  return NextResponse.json({ logoUrl });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.SETTINGS_EDIT))) return forbidden();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { logoUrl: true },
  });

  await deletePreviousLogo(tenant?.logoUrl);

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { logoUrl: null },
  });

  await logAudit(req, session, {
    action: "DELETE",
    module: "SETTINGS",
    entityId: session.user.tenantId,
    description: `Eliminó el logo del restaurante`,
  });

  return NextResponse.json({ success: true });
}
