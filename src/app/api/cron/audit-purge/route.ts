import { NextResponse } from "next/server";
import { purgeOldAuditLogs, getRetentionMonths } from "@/lib/audit-retention";

export const dynamic = "force-dynamic";

/**
 * Purgado periódico de AuditLog. Pensado para ejecutarse por Vercel Cron
 * (ver vercel.json). Vercel envía `Authorization: Bearer ${CRON_SECRET}` en cada
 * invocación cuando la variable CRON_SECRET está definida.
 *
 * Protección: requiere CRON_SECRET configurado y coincidente. Si no está
 * configurado, la ruta no opera (evita un endpoint de borrado abierto).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado" },
      { status: 500 }
    );
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const months = getRetentionMonths();
    const { deleted, cutoff } = await purgeOldAuditLogs(months);
    return NextResponse.json({ ok: true, retentionMonths: months, cutoff, deleted });
  } catch (err) {
    console.error("[cron/audit-purge] error al purgar:", err);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
}
