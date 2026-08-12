import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

// GET — bonos de concurso con sus cuotas.
//   ?status=PENDIENTE|PARCIAL|PAGADO|ANULADO
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD  → bonos con cuotas en esa quincena
//   ?employeeId=...
export async function GET(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const employeeId = url.searchParams.get("employeeId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const bonuses = await prisma.contestBonus.findMany({
    where: {
      tenantId,
      ...(status ? { status } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(from && to
        ? { payments: { some: { periodStart: { gte: from }, periodEnd: { lte: to } } } }
        : {}),
    },
    include: {
      employee: { select: { id: true, name: true, active: true } },
      payments: { orderBy: { installment: "asc" } },
    },
    orderBy: [{ assignedAt: "desc" }],
  });

  const totals = bonuses.reduce(
    (acc, b) => {
      if (b.status === "ANULADO") return acc;
      acc.total += b.totalAmount;
      acc.paid += b.paidAmount;
      acc.pending += b.totalAmount - b.paidAmount;
      return acc;
    },
    { total: 0, paid: 0, pending: 0 }
  );

  return NextResponse.json({
    bonuses: bonuses.map((b) => ({ ...b, pendingAmount: b.totalAmount - b.paidAmount })),
    totals,
  });
}
