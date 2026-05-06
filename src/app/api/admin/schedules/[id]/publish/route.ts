import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const schedule = await prisma.schedule.findFirst({ where: { id, tenantId: session.user.tenantId } });
  if (!schedule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.schedule.update({
    where: { id },
    data: { published: !schedule.published },
  });

  return NextResponse.json({ success: true, published: !schedule.published });
}
