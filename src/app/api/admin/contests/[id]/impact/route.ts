import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { computeImpactPreview } from "@/lib/contest-service";
import type { ContestStatus } from "@/lib/contests";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

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
  if (!session || !(await sessionCan(session, PERMISSIONS.CONTESTS_VIEW))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const preview = await computeImpactPreview({
    tenantId,
    contestId: id,
    simulated: { status: simulatedStatus, startDate, endDate, items: contest.items },
  });

  return NextResponse.json({ action, preview });
}
