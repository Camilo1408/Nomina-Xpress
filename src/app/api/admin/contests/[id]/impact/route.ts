import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { computeImpactPreview } from "@/lib/contest-service";
import { isRangeWithinLimit, type ContestStatus } from "@/lib/contests";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { forbidden, unauthorized } from "@/lib/api-response";

/**
 * Previsualiza el impacto de una acción sobre las propinas. NO ESCRIBE NADA.
 *
 * Es lo que alimenta el diálogo de confirmación: el usuario ve exactamente qué
 * días y qué montos se van a mover antes de decidir. Sin esto, "confirmar" sería
 * firmar en blanco.
 *
 *   GET /api/admin/contests/[id]/impact?action=activar
 *   GET /api/admin/contests/[id]/impact?action=cancelar
 *   GET /api/admin/contests/[id]/impact?action=rango&startDate=...&endDate=...
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.CONTESTS_VIEW))) return forbidden();

  const { id } = await params;
  const tenantId = session.user.tenantId;
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "activar";

  const contest = await prisma.contest.findFirst({
    where: { id, tenantId },
    include: { items: { where: { outcome: "PENDIENTE" }, select: { id: true, percent: true } } },
  });
  if (!contest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let simulatedStatus: ContestStatus;
  let startDate = contest.startDate;
  let endDate = contest.endDate;

  switch (action) {
    case "activar":
      simulatedStatus = "ACTIVO";
      break;
    case "cancelar":
      simulatedStatus = "CANCELADO";
      break;
    case "rango":
      simulatedStatus = contest.status as ContestStatus;
      startDate = url.searchParams.get("startDate") ?? startDate;
      endDate = url.searchParams.get("endDate") ?? endDate;
      break;
    default:
      return NextResponse.json(
        { error: { message: `Acción desconocida: ${action}` } },
        { status: 400 }
      );
  }

  // Las fechas de la acción "rango" llegan por la URL: se validan aquí, porque un rango
  // inválido o demasiado largo hacía lanzar al cálculo y la ruta respondía 500.
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE.test(startDate) || !DATE.test(endDate) || endDate < startDate || !isRangeWithinLimit(startDate, endDate)) {
    return NextResponse.json({ error: { message: "El rango de fechas no es válido" } }, { status: 400 });
  }

  const preview = await computeImpactPreview({
    tenantId,
    contestId: id,
    simulated: { status: simulatedStatus, startDate, endDate, items: contest.items },
  });

  return NextResponse.json({ action, preview });
}
