import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Session } from "next-auth";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

/** Resolve the real DB user id — handles old JWT tokens that don't carry .id */
async function resolveUserId(session: Session): Promise<string | null> {
  // New tokens have id directly
  if (session.user.id) return session.user.id;
  // Fallback: look up by username (stored in session.user.name)
  if (session.user.name) {
    const user = await prisma.user.findUnique({
      where: { username: session.user.name },
      select: { id: true },
    });
    return user?.id ?? null;
  }
  return null;
}

// POST — register push subscription for current user
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !["EMPLOYEE", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", issues: parsed.error.issues }, { status: 400 });
  }

  const userId = await resolveUserId(session as Session);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 400 });

  const { endpoint, p256dh, auth: authKey } = parsed.data;
  const tenantId = session.user.tenantId;

  // Upsert by endpoint — same device re-subscribing gets updated
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh, auth: authKey, userId, tenantId },
    create: { endpoint, p256dh, auth: authKey, userId, tenantId },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — remove push subscription for current user
export async function DELETE() {
  const session = await auth();
  if (!session || !["EMPLOYEE", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await resolveUserId(session as Session);
  if (!userId) return NextResponse.json({ ok: true }); // nothing to delete

  await prisma.pushSubscription.deleteMany({ where: { userId } });

  return NextResponse.json({ ok: true });
}

// GET — check if current user has an active subscription
export async function GET() {
  const session = await auth();
  if (!session || !["EMPLOYEE", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await resolveUserId(session as Session);
  if (!userId) return NextResponse.json({ subscribed: false });

  const count = await prisma.pushSubscription.count({ where: { userId } });
  return NextResponse.json({ subscribed: count > 0 });
}
