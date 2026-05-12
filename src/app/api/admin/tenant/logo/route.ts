import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Extract Cloudinary public_id from a stored URL
function extractPublicId(url: string): string | null {
  // URL format: https://res.cloudinary.com/<cloud>/image/upload/v.../nomina-xpress/<id>.ext
  const match = url.match(/nomina-xpress\/([^.?]+)/);
  return match ? `nomina-xpress/${match[1]}` : null;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["jpg", "jpeg", "png", "svg", "webp"].includes(ext ?? "")) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  // Delete previous logo from Cloudinary if exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { logoUrl: true },
  });
  if (tenant?.logoUrl) {
    const publicId = extractPublicId(tenant.logoUrl);
    if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => null);
  }

  // Upload new logo to Cloudinary
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "nomina-xpress",
          public_id: session!.user.tenantId,
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

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { logoUrl: result.secure_url },
  });

  return NextResponse.json({ logoUrl: result.secure_url });
}

export async function DELETE() {
  const session = await auth();
  if (!session || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { logoUrl: true },
  });

  if (tenant?.logoUrl) {
    const publicId = extractPublicId(tenant.logoUrl);
    if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => null);
  }

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { logoUrl: null },
  });

  return NextResponse.json({ success: true });
}
