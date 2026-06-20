import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !["EMPLOYEE", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const employeeId = session.user.employeeId;
  if (!employeeId) return NextResponse.json({ error: "No employee linked" }, { status: 400 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to required" }, { status: 400 });
  }

  const tenantId = session.user.tenantId;

  const distributions = await prisma.tipDistribution.findMany({
    where: {
      tenantId,
      employeeId,
      tipEntry: { date: { gte: from, lte: to } },
    },
    include: { tipEntry: { select: { date: true, totalAmount: true } } },
    orderBy: { tipEntry: { date: "asc" } },
  });

  const totalTips = distributions.reduce((s, d) => s + Number(d.amount), 0);

  return NextResponse.json({ distributions, totalTips, period: { from, to } });
}
