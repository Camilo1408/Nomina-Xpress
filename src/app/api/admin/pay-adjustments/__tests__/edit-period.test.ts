// Corrección del período de un ajuste ya creado: solo con el permiso
// pay_adjustments:edit_period (PROPRIETARY y SUPERADMIN por defecto).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS } from "@/lib/permission-keys";

const SESSION = { user: { id: "u1", tenantId: "t1", role: "ADMIN" } };

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => SESSION) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    payAdjustment: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    employee: { findFirst: vi.fn() },
  },
}));

const granted = new Set<string>();
vi.mock("@/lib/get-permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/get-permissions")>();
  return { ...actual, sessionCan: vi.fn(async (_s: unknown, key: string) => granted.has(key)) };
});

import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PUT } from "../[id]/route";
import { POST } from "../route";

const findFirst = prisma.payAdjustment.findFirst as ReturnType<typeof vi.fn>;
const updateMany = prisma.payAdjustment.updateMany as ReturnType<typeof vi.fn>;
const create = prisma.payAdjustment.create as ReturnType<typeof vi.fn>;

const EXISTING = {
  id: "adj1",
  tenantId: "t1",
  employeeId: "e1",
  type: "BONUS" as const,
  amount: 70_000,
  description: "bono administracion",
  periodStart: "2026-06-16",
  periodEnd: "2026-07-01", // desalineado: se pasó un día de la quincena
  createdAt: new Date(),
};

function putReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/pay-adjustments/adj1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "adj1" });

const BASE_BODY = { type: "BONUS", amount: 70_000, description: "bono administracion" };

beforeEach(() => {
  vi.clearAllMocks();
  granted.clear();
  granted.add(PERMISSIONS.PAY_ADJUSTMENTS_EDIT);
  findFirst.mockResolvedValue(EXISTING);
  updateMany.mockResolvedValue({ count: 1 });
  create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data }));
});

describe("PUT /api/admin/pay-adjustments/[id] — permisos", () => {
  it("sin pay_adjustments:edit responde 401 y no toca la BD", async () => {
    granted.clear();
    const res = await PUT(putReq(BASE_BODY), { params });
    expect(res.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("con edit pero SIN edit_period se puede editar monto y descripción", async () => {
    const res = await PUT(putReq({ ...BASE_BODY, amount: 80_000 }), { params });
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const data = updateMany.mock.calls[0][0].data;
    expect(data.amount).toBe(80_000);
    // El período no se toca ni se reescribe.
    expect(data.periodStart).toBeUndefined();
    expect(data.periodEnd).toBeUndefined();
  });

  it("con edit pero SIN edit_period, intentar mover las fechas responde 403 y no escribe", async () => {
    const res = await PUT(putReq({ ...BASE_BODY, periodStart: "2026-06-16", periodEnd: "2026-06-30" }), { params });
    expect(res.status).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("enviar las MISMAS fechas sin edit_period no se considera un cambio de período", async () => {
    const res = await PUT(
      putReq({ ...BASE_BODY, periodStart: EXISTING.periodStart, periodEnd: EXISTING.periodEnd }),
      { params }
    );
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("PUT /api/admin/pay-adjustments/[id] — corrección del período", () => {
  beforeEach(() => granted.add(PERMISSIONS.PAY_ADJUSTMENTS_EDIT_PERIOD));

  it("corrige la fecha final (el caso 01→16 que debía ser 01→15)", async () => {
    findFirst.mockResolvedValue({ ...EXISTING, periodStart: "2026-07-01", periodEnd: "2026-07-16" });
    const res = await PUT(putReq({ ...BASE_BODY, periodEnd: "2026-07-15" }), { params });
    expect(res.status).toBe(200);
    const data = updateMany.mock.calls[0][0].data;
    expect(data.periodStart).toBe("2026-07-01");
    expect(data.periodEnd).toBe("2026-07-15");
  });

  it("corrige solo la fecha de inicio, conservando la final", async () => {
    const res = await PUT(putReq({ ...BASE_BODY, periodStart: "2026-06-20" }), { params });
    expect(res.status).toBe(200);
    const data = updateMany.mock.calls[0][0].data;
    expect(data.periodStart).toBe("2026-06-20");
    expect(data.periodEnd).toBe(EXISTING.periodEnd);
  });

  it("corrige ambas fechas a la vez", async () => {
    const res = await PUT(putReq({ ...BASE_BODY, periodStart: "2026-06-16", periodEnd: "2026-06-30" }), { params });
    expect(res.status).toBe(200);
    const data = updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ periodStart: "2026-06-16", periodEnd: "2026-06-30" });
  });

  it("rechaza un rango invertido con 400", async () => {
    const res = await PUT(putReq({ ...BASE_BODY, periodStart: "2026-07-20", periodEnd: "2026-07-01" }), { params });
    expect(res.status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rechaza una fecha con formato inválido con 400", async () => {
    const res = await PUT(putReq({ ...BASE_BODY, periodStart: "20/07/2026" }), { params });
    expect(res.status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("un ajuste inexistente (u de otro tenant) responde 404", async () => {
    findFirst.mockResolvedValue(null);
    const res = await PUT(putReq({ ...BASE_BODY, periodEnd: "2026-06-30" }), { params });
    expect(res.status).toBe(404);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("la escritura sigue acotada al tenant de la sesión", async () => {
    await PUT(putReq({ ...BASE_BODY, periodEnd: "2026-06-30" }), { params });
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: "adj1", tenantId: "t1" });
  });

  it("deja rastro en auditoría del período anterior y el nuevo", async () => {
    await PUT(putReq({ ...BASE_BODY, periodEnd: "2026-06-30" }), { params });
    const entry = (logAudit as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(entry.description).toContain("2026-06-16–2026-07-01");
    expect(entry.description).toContain("2026-06-16–2026-06-30");
    expect(entry.before).toMatchObject({ periodEnd: "2026-07-01" });
    expect(entry.after).toMatchObject({ periodEnd: "2026-06-30" });
  });
});

describe("POST /api/admin/pay-adjustments — validación del período al crear", () => {
  beforeEach(() => {
    granted.clear();
    granted.add(PERMISSIONS.PAY_ADJUSTMENTS_CREATE);
    (prisma.employee.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "Claudia" });
  });

  function postReq(body: Record<string, unknown>) {
    return new Request("http://localhost/api/admin/pay-adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const NEW_ADJ = {
    employeeId: "e1",
    type: "DISCOUNT",
    amount: 10_225,
    description: "ALBONDIGAS",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-15",
  };

  it("crea un ajuste con un período válido", async () => {
    const res = await POST(postReq(NEW_ADJ));
    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({ tenantId: "t1", periodStart: "2026-07-01", periodEnd: "2026-07-15" });
  });

  it("rechaza un período invertido con 400", async () => {
    const res = await POST(postReq({ ...NEW_ADJ, periodStart: "2026-07-15", periodEnd: "2026-07-01" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
