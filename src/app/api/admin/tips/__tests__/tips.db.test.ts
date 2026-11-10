// Propinas contra una SQLite real: reparto por horas, invariante del total, duplicados,
// aislamiento por tenant y la consulta del empleado sobre sus propias propinas.

import { getRequest, jsonRequest, resetDb, routeParams, seedTenant, type SeededTenant, type TestSession } from "@/test/db"; // primero: fija la base de pruebas
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

let session: TestSession | null;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));

import { prisma } from "@/lib/db";
import { TIP_MENAJE_PERCENT } from "@/lib/contests";
import { GET, POST } from "../route";
import { DELETE, PUT } from "../[id]/route";
import { GET as getDeductions } from "../deductions/route";
import { GET as getMyTips } from "../../../employee/tips/route";

const DIA = "2026-11-04";
const at = (hhmm: string, date = DIA) => new Date(`${date}T${hhmm}:00-05:00`);

const crear = (body: unknown) => POST(jsonRequest("POST", body));
const editar = (id: string, body: unknown) => PUT(jsonRequest("PUT", body), routeParams({ id }));
const borrar = (id: string) => DELETE(jsonRequest("DELETE"), routeParams({ id }));

let a: SeededTenant;
let b: SeededTenant;

/** Ana trabaja 6 h y Luis 2 h el día de la prueba. */
async function horas(t: SeededTenant, date = DIA) {
  await prisma.timeEntry.createMany({
    data: [
      { tenantId: t.tenantId, employeeId: t.ana.id, date, checkIn: at("08:00", date), checkOut: at("14:00", date) },
      { tenantId: t.tenantId, employeeId: t.luis.id, date, checkIn: at("08:00", date), checkOut: at("10:00", date) },
    ],
  });
}

/** Invariante del módulo: total = menaje + reserva de concursos + neto, y el neto se reparte completo. */
async function expectCuadra(id: string) {
  const entry = await prisma.tipEntry.findUniqueOrThrow({ where: { id }, include: { distributions: true } });
  expect(entry.menaje + entry.contestReserved + entry.netAmount).toBeCloseTo(entry.totalAmount, 6);
  if (entry.distributions.length > 0) {
    expect(entry.distributions.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(entry.netAmount, 0);
  }
  return entry;
}

beforeEach(async () => {
  await resetDb();
  a = await seedTenant("a");
  b = await seedTenant("b");
  session = a.sessionOf("proprietario");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/admin/tips", () => {
  it("descuenta el menaje y reparte el neto en proporción a las horas", async () => {
    await horas(a);
    const res = await crear({ date: DIA, totalAmount: 200_000, notes: "Viernes" });
    expect(res.status).toBe(201);
    const { entry } = await res.json();

    const guardado = await expectCuadra(entry.id);
    expect(guardado).toMatchObject({
      tenantId: a.tenantId, date: DIA, totalAmount: 200_000, contestReserved: 0,
      menaje: (200_000 * TIP_MENAJE_PERCENT) / 100, periodStart: "2026-11-01", periodEnd: "2026-11-15", notes: "Viernes",
    });

    // 6 h y 2 h: Ana recibe tres veces lo de Luis.
    const porEmpleado = Object.fromEntries(guardado.distributions.map((d) => [d.employeeId, d]));
    expect(porEmpleado[a.ana.id].hoursWorked).toBe(6);
    expect(porEmpleado[a.luis.id].hoursWorked).toBe(2);
    expect(porEmpleado[a.ana.id].amount / porEmpleado[a.luis.id].amount).toBeCloseTo(3, 2);
    expect(await prisma.auditLog.count({ where: { action: "CREATE", module: "TIPS" } })).toBe(1);
  });

  it("el porcentaje de propina del empleado pondera sus horas", async () => {
    await horas(a);
    // Luis al 50 %: sus 2 h cuentan como 1 h efectiva frente a las 6 h de Ana.
    await prisma.employee.update({ where: { id: a.luis.id }, data: { tipPercent: 50 } });
    const { entry } = await (await crear({ date: DIA, totalAmount: 140_000 })).json();
    const guardado = await expectCuadra(entry.id);
    const porEmpleado = Object.fromEntries(guardado.distributions.map((d) => [d.employeeId, d]));
    expect(porEmpleado[a.luis.id].effectiveHours).toBe(1);
    expect(porEmpleado[a.ana.id].amount / porEmpleado[a.luis.id].amount).toBeCloseTo(6, 2);
  });

  it("un empleado inactivo o con un turno sin salida no entra al reparto", async () => {
    await horas(a);
    await prisma.employee.update({ where: { id: a.luis.id }, data: { active: false } });
    const { entry } = await (await crear({ date: DIA, totalAmount: 100_000 })).json();
    const guardado = await expectCuadra(entry.id);
    expect(guardado.distributions.map((d) => d.employeeId)).toEqual([a.ana.id]);
  });

  it("sin horas registradas ese día se guarda el total, sin reparto", async () => {
    const { entry } = await (await crear({ date: DIA, totalAmount: 80_000 })).json();
    const guardado = await expectCuadra(entry.id);
    expect(guardado.distributions).toEqual([]);
  });

  it("[NEG] un segundo registro para la misma fecha responde 409", async () => {
    expect((await crear({ date: DIA, totalAmount: 100_000 })).status).toBe(201);
    const res = await crear({ date: DIA, totalAmount: 50_000 });
    expect(res.status).toBe(409);
    expect(await prisma.tipEntry.count()).toBe(1);
  });

  it("[RN-01] la misma fecha en otro tenant no choca, y solo cuenta sus propias horas", async () => {
    await horas(a);
    await horas(b);
    expect((await crear({ date: DIA, totalAmount: 100_000 })).status).toBe(201);
    session = b.sessionOf("proprietario");
    const { entry } = await (await crear({ date: DIA, totalAmount: 60_000 })).json();
    const guardado = await expectCuadra(entry.id);
    expect(guardado.tenantId).toBe(b.tenantId);
    expect(new Set(guardado.distributions.map((d) => d.employeeId))).toEqual(new Set([b.ana.id, b.luis.id]));
  });

  it.each([
    ["total en 0", { date: DIA, totalAmount: 0 }],
    ["total negativo", { date: DIA, totalAmount: -5 }],
    ["total como texto", { date: DIA, totalAmount: "100000" }],
    ["fecha con otro formato", { date: "04-11-2026", totalAmount: 1000 }],
  ])("[NEG] %s responde 400", async (_caso, body) => {
    expect((await crear(body)).status).toBe(400);
    expect(await prisma.tipEntry.count()).toBe(0);
  });

  it("[CP-50] sin sesión 401; sin permiso 403", async () => {
    session = null;
    expect((await crear({ date: DIA, totalAmount: 1000 })).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await crear({ date: DIA, totalAmount: 1000 })).status).toBe(403);
  });
});

describe("GET /api/admin/tips", () => {
  it("[RN-01] lista las del tenant por rango, con el reparto de mayor a menor", async () => {
    await horas(a);
    await crear({ date: DIA, totalAmount: 100_000 });
    await crear({ date: "2026-11-20", totalAmount: 50_000 });
    session = b.sessionOf("proprietario");
    await crear({ date: DIA, totalAmount: 999_000 });

    session = a.sessionOf("proprietario");
    const todas = (await (await GET(getRequest())).json()).entries;
    expect(todas.map((e: { date: string }) => e.date)).toEqual(["2026-11-20", DIA]);

    const rango = (await (await GET(getRequest({ from: "2026-11-01", to: "2026-11-15" }))).json()).entries;
    expect(rango).toHaveLength(1);
    expect(rango[0].distributions.map((d: { employee: { name: string } }) => d.employee.name)).toEqual(["Ana a", "Luis a"]);
    expect(rango[0].contestReserves).toEqual([]);
  });

  it("[CP-50] sin sesión 401; sin permiso 403", async () => {
    session = null;
    expect((await GET(getRequest())).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await GET(getRequest())).status).toBe(403);
  });
});

describe("PUT y DELETE /api/admin/tips/[id]", () => {
  const nueva = async () => {
    await horas(a);
    return (await (await crear({ date: DIA, totalAmount: 100_000 })).json()).entry as { id: string };
  };

  it("cambiar el total recalcula menaje, neto y reparto", async () => {
    const { id } = await nueva();
    const res = await editar(id, { totalAmount: 300_000, notes: "Corregido" });
    expect(res.status).toBe(200);
    const guardado = await expectCuadra(id);
    expect(guardado).toMatchObject({ totalAmount: 300_000, menaje: (300_000 * TIP_MENAJE_PERCENT) / 100, notes: "Corregido" });
    expect(guardado.distributions).toHaveLength(2);
    expect(await prisma.auditLog.count({ where: { action: "UPDATE", module: "TIPS" } })).toBe(1);
  });

  it("[NEG] un total inválido responde 400 y deja el registro como estaba", async () => {
    const { id } = await nueva();
    expect((await editar(id, { totalAmount: 0 })).status).toBe(400);
    expect((await expectCuadra(id)).totalAmount).toBe(100_000);
  });

  it("eliminar borra el registro y su reparto", async () => {
    const { id } = await nueva();
    expect((await borrar(id)).status).toBe(200);
    expect(await prisma.tipEntry.count()).toBe(0);
    expect(await prisma.tipDistribution.count()).toBe(0);
  });

  it("[RN-01] las propinas de otro tenant responden 404", async () => {
    const { id } = await nueva();
    session = b.sessionOf("proprietario");
    expect((await editar(id, { totalAmount: 1 })).status).toBe(404);
    expect((await borrar(id)).status).toBe(404);
    expect((await expectCuadra(id)).totalAmount).toBe(100_000);
  });

  it("[CP-50] sin sesión 401; sin permiso 403", async () => {
    const { id } = await nueva();
    for (const llamada of [() => editar(id, { totalAmount: 1 }), () => borrar(id)]) {
      session = null;
      expect((await llamada()).status).toBe(401);
      session = a.sessionOf("empleado");
      expect((await llamada()).status).toBe(403);
    }
  });
});

describe("GET /api/admin/tips/deductions", () => {
  it("sin concursos activos, el único descuento del día es el menaje", async () => {
    const res = await getDeductions(getRequest({ date: DIA }));
    expect(await res.json()).toEqual({
      date: DIA, menajePercent: TIP_MENAJE_PERCENT, contestPercent: 0, totalPercent: TIP_MENAJE_PERCENT, items: [],
    });
  });

  it("[NEG] sin fecha o con formato inválido responde 400; sin sesión 401; sin permiso 403", async () => {
    expect((await getDeductions(getRequest())).status).toBe(400);
    expect((await getDeductions(getRequest({ date: "hoy" }))).status).toBe(400);
    session = null;
    expect((await getDeductions(getRequest({ date: DIA }))).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await getDeductions(getRequest({ date: DIA }))).status).toBe(403);
  });
});

describe("GET /api/employee/tips", () => {
  it("el empleado ve solo sus propinas del rango, con el total", async () => {
    await horas(a);
    await crear({ date: DIA, totalAmount: 100_000 });
    await horas(a, "2026-11-20");
    await crear({ date: "2026-11-20", totalAmount: 100_000 });

    session = a.sessionOf("empleado"); // enlazado a Ana
    const res = await getMyTips(getRequest({ from: "2026-11-01", to: "2026-11-15" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.distributions).toHaveLength(1);
    expect(body.distributions[0].employeeId).toBe(a.ana.id);
    expect(body.totalTips).toBeCloseTo(body.distributions[0].amount, 6);
    expect(body.period).toEqual({ from: "2026-11-01", to: "2026-11-15" });
  });

  it("[NEG] sin rango 400; un usuario sin empleado enlazado 400; un PROPRIETARY 403; sin sesión 401", async () => {
    session = a.sessionOf("empleado");
    expect((await getMyTips(getRequest())).status).toBe(400);
    session = a.sessionOf("admin");
    expect((await getMyTips(getRequest({ from: "2026-11-01", to: "2026-11-15" }))).status).toBe(400);
    session = a.sessionOf("proprietario");
    expect((await getMyTips(getRequest({ from: "2026-11-01", to: "2026-11-15" }))).status).toBe(403);
    session = null;
    expect((await getMyTips(getRequest({ from: "2026-11-01", to: "2026-11-15" }))).status).toBe(401);
  });
});
