import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { resolveContestDeductionsForDate } from "@/lib/contest-service";
import { TIP_MENAJE_PERCENT } from "@/lib/contests";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

/**
 * Qué descontaría un día concreto, ANTES de registrar sus propinas.
 *
 * Alimenta el aviso del modal de propinas: en vez de un texto fijo que dice
 * "se descontará el 10%", quien registra ve el descuento real de ese día con los
 * concursos que estén activos.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIPS_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = new URL(req.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: { message: "Falta el parámetro date" } }, { status: 400 });
  }

  const tenantId = session.user.tenantId;
  const deductions = await resolveContestDeductionsForDate(tenantId, date);

  if (deductions.length === 0) {
    return NextResponse.json({
      date,
      menajePercent: TIP_MENAJE_PERCENT,
      contestPercent: 0,
      totalPercent: TIP_MENAJE_PERCENT,
      items: [],
    });
  }

  const items = await prisma.contestItem.findMany({
    where: { tenantId, id: { in: deductions.map((d) => d.contestItemId) } },
    select: { id: true, name: true, contest: { select: { name: true, status: true } } },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  const detalle = deductions.map((d) => ({
    contestItemId: d.contestItemId,
    percent: d.percent,
    itemName: byId.get(d.contestItemId)?.name ?? "—",
    contestName: byId.get(d.contestItemId)?.contest.name ?? "—",
    // Una reserva congelada ya no depende del total que se registre hoy.
    frozen: d.fixedAmount !== undefined,
    frozenAmount: d.fixedAmount ?? null,
  }));

  const contestPercent = Math.round(detalle.reduce((s, d) => s + d.percent, 0) * 100) / 100;

  return NextResponse.json({
    date,
    menajePercent: TIP_MENAJE_PERCENT,
    contestPercent,
    totalPercent: Math.round((TIP_MENAJE_PERCENT + contestPercent) * 100) / 100,
    items: detalle,
  });
}
