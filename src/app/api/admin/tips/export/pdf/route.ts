import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { loadTenantLogo } from "@/lib/logo-loader";
import { parseTipsReportRange } from "@/lib/tips-report";
import { fetchTipsReport } from "@/lib/tips-report.server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIPS_EXPORT_PDF))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const range = parseTipsReportRange(new URL(req.url).searchParams);
  if (!range.ok) return NextResponse.json({ error: range.error }, { status: 400 });
  const { from, to } = range;

  const tenantId = session.user.tenantId;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const report = await fetchTipsReport(tenantId, from, to);

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { TipsPDF } = await import("@/lib/pdf/tips-template");
  const logo = await loadTenantLogo(tenant?.logoUrl);

  const buffer = await renderToBuffer(
    TipsPDF({
      tenantName: tenant?.name ?? "Restaurante",
      period: { from, to },
      report,
      primaryColor: tenant?.primaryColor ?? "#C1643F",
      logo,
    })
  );

  await logAudit(req, session, {
    action: "EXPORT",
    module: "TIPS",
    description: `Exportó el reporte de propinas en PDF (${from} a ${to})`,
    after: { format: "PDF", from, to },
  });

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="propinas_${from}_${to}.pdf"`,
    },
  });
}
