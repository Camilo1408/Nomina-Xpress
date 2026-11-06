import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { forbidden, readJsonBody, unauthorized } from "@/lib/api-response";

const schema = z.object({
  employeeId: z.string(),
  type: z.enum(["DISCOUNT", "BONUS"]),
  amount: z.number().positive(),
  description: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((d) => d.periodStart <= d.periodEnd, {
  message: "La fecha de inicio no puede ser posterior a la fecha final",
  path: ["periodEnd"],
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!(await sessionCan(session, PERMISSIONS.PAY_ADJUSTMENTS_CREATE))) return forbidden();
  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.response;
  const body = raw.body;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const adjustment = await prisma.payAdjustment.create({
    data: { ...parsed.data, tenantId: session.user.tenantId },
  });

  const employee = await prisma.employee.findFirst({
    where: { id: parsed.data.employeeId, tenantId: session.user.tenantId },
    select: { name: true },
  });

  await logAudit(req, session, {
    action: "PAYMENT",
    module: "PAY_ADJUSTMENTS",
    entityId: adjustment.id,
    entityLabel: employee?.name ?? parsed.data.employeeId,
    description: `Registró un ${
      parsed.data.type === "BONUS" ? "bono" : "descuento"
    } de ${parsed.data.amount} a "${employee?.name ?? "empleado"}" (${parsed.data.description})`,
    after: parsed.data,
  });

  return NextResponse.json(adjustment, { status: 201 });
}
