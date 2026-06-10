import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { sendPushNotification } from "@/lib/push";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !["SUPERADMIN", "PROPRIETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const schedule = await prisma.schedule.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: { shifts: { select: { employeeId: true } } },
  });
  if (!schedule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newPublished = !schedule.published;

  await prisma.schedule.update({
    where: { id },
    data: { published: newPublished },
  });

  // Send push notifications to all employees with shifts when publishing
  if (newPublished) {
    const employeeIds = [...new Set(schedule.shifts.map((s) => s.employeeId))];

    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        tenantId: session.user.tenantId,
        user: { employeeId: { in: employeeIds } },
      },
    });

    if (subscriptions.length > 0) {
      const results = await Promise.allSettled(
        subscriptions.map((sub) =>
          sendPushNotification(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            {
              title: "📅 Horario actualizado",
              body: `Se publicó el horario "${schedule.name}". ¡Revísalo ahora!`,
              url: "/portal/schedule",
            }
          )
        )
      );

      // Clean up expired/invalid subscriptions (status 410)
      const expired = subscriptions.filter((_, i) => {
        const r = results[i];
        return r.status === "fulfilled" && r.value === false;
      });
      if (expired.length > 0) {
        await prisma.pushSubscription.deleteMany({
          where: { endpoint: { in: expired.map((s) => s.endpoint) } },
        });
      }
    }
  }

  return NextResponse.json({ success: true, published: newPublished });
}
