// Concursos e incentivos contra una SQLite real: el ciclo completo del dinero.
//
// La invariante que sostiene el módulo, por día, es
//   TipEntry.totalAmount = menaje + contestReserved + netAmount
// y la reserva de un concurso finalizado no se mueve más. Aquí se recorre el ciclo real
// (crear → activar → reservar → finalizar → adjudicar → pagar) y sus salidas (desierto,
// cancelación), comprobando el estado que queda en la base después de cada paso.

import { getRequest, jsonRequest, resetDb, routeParams, seedTenant, type SeededTenant, type TestSession } from "@/test/db"; // primero: fija la base de pruebas
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

let session: TestSession | null;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));

import { prisma } from "@/lib/db";
import * as contests from "../route";
import * as contest from "../[id]/route";
import { POST as activateRoute } from "../[id]/activate/route";
import { POST as cancelRoute } from "../[id]/cancel/route";
import { POST as finalizeRoute } from "../[id]/finalize/route";
import { GET as impactRoute } from "../[id]/impact/route";
import { POST as addItemRoute } from "../[id]/items/route";
import * as itemRoute from "../[id]/items/[itemId]/route";
import { PUT as resultsRoute } from "../[id]/items/[itemId]/results/route";
import { POST as awardRoute } from "../[id]/items/[itemId]/award/route";
import { POST as voidItemRoute } from "../[id]/items/[itemId]/void/route";
import { GET as bonusesRoute } from "../../contest-bonuses/route";
import { POST as voidBonusRoute } from "../../contest-bonuses/[id]/void/route";
import { PUT as reschedulePaymentRoute } from "../../contest-bonuses/[id]/payments/[paymentId]/route";
import { POST as payRoute } from "../../contest-bonuses/[id]/payments/[paymentId]/pay/route";
import { POST as createTip } from "../../tips/route";
import { PUT as editTip } from "../../tips/[id]/route";
import { GET as deductionsRoute } from "../../tips/deductions/route";
import { GET as myBonusesRoute } from "../../../employee/contest-bonuses/route";

// El concurso de las pruebas ya terminó (marzo de 2025): finalizarlo no es «anticipado».
const INICIO = "2025-03-03";
const FIN = "2025-03-14";
const D1 = "2025-03-04";
const D2 = "2025-03-05";
const FUERA = "2025-03-20";

let a: SeededTenant;
let b: SeededTenant;

interface ContestRow {
  id: string;
  status: string;
  items: Array<{ id: string; name: string; percent: number; outcome: string }>;
}

const body = (over: Record<string, unknown> = {}) => ({
  name: "Concurso de marzo",
  startDate: INICIO,
  endDate: FIN,
  payoutMode: "DIVIDIDO",
  items: [
    { name: "Ventas", goalValue: 10, goalUnit: "unidades", criteria: "MAYOR_VALOR", percent: 5, winnerMode: "GANADOR_UNICO" },
    { name: "Postres", goalValue: 5, goalUnit: "postres", criteria: "MAYOR_VALOR", percent: 2.5, winnerMode: "REPARTIDO" },
  ],
  ...over,
});

const crear = (over: Record<string, unknown> = {}) => contests.POST(jsonRequest("POST", body(over)));
const nuevo = async (over: Record<string, unknown> = {}) => (await (await crear(over)).json()).contest as ContestRow;
const activar = (id: string, data: unknown = {}) => activateRoute(jsonRequest("POST", data), routeParams({ id }));
const finalizar = (id: string, data: unknown = {}) => finalizeRoute(jsonRequest("POST", data), routeParams({ id }));
const cancelar = (id: string, data: unknown = { reason: "Se suspende", confirmImpact: true }) =>
  cancelRoute(jsonRequest("POST", data), routeParams({ id }));
const resultados = (id: string, itemId: string, results: unknown) =>
  resultsRoute(jsonRequest("PUT", { results }), routeParams({ id, itemId }));
const adjudicar = (id: string, itemId: string, data: unknown = {}) =>
  awardRoute(jsonRequest("POST", data), routeParams({ id, itemId }));
const desierto = (id: string, itemId: string, data: unknown = { reason: "Nadie llegó", confirmImpact: true }) =>
  voidItemRoute(jsonRequest("POST", data), routeParams({ id, itemId }));
const propina = async (date: string, totalAmount: number) =>
  (await (await createTip(jsonRequest("POST", { date, totalAmount }))).json()).entry as { id: string };

/** Ana trabaja 6 h y Luis 2 h. */
async function horas(t: SeededTenant, date: string) {
  const at = (hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
  await prisma.timeEntry.createMany({
    data: [
      { tenantId: t.tenantId, employeeId: t.ana.id, date, checkIn: at("08:00"), checkOut: at("14:00") },
      { tenantId: t.tenantId, employeeId: t.luis.id, date, checkIn: at("08:00"), checkOut: at("10:00") },
    ],
  });
}

/** Estado de un día: comprueba la invariante y devuelve lo reservado por ítem. */
async function dia(t: SeededTenant, date: string) {
  const entry = await prisma.tipEntry.findUniqueOrThrow({
    where: { tenantId_date: { tenantId: t.tenantId, date } },
    include: { distributions: true, contestReserves: { include: { contestItem: true } } },
  });
  expect(entry.menaje + entry.contestReserved + entry.netAmount, `invariante del ${date}`).toBeCloseTo(entry.totalAmount, 6);
  const vivas = entry.contestReserves.filter((r) => r.status === "RESERVADA");
  expect(vivas.reduce((s, r) => s + r.amount, 0), `reservas del ${date}`).toBeCloseTo(entry.contestReserved, 6);
  if (entry.distributions.length > 0) {
    expect(entry.distributions.reduce((s, d) => s + d.amount, 0), `reparto del ${date}`).toBeCloseTo(entry.netAmount, 0);
  }
  return {
    total: entry.totalAmount,
    menaje: entry.menaje,
    reservado: entry.contestReserved,
    neto: entry.netAmount,
    porItem: Object.fromEntries(vivas.map((r) => [r.contestItem.name, r.amount])),
    devueltas: entry.contestReserves.filter((r) => r.status === "DEVUELTA").map((r) => r.contestItem.name),
  };
}

beforeEach(async () => {
  await resetDb();
  a = await seedTenant("a");
  b = await seedTenant("b");
  session = a.sessionOf("proprietario");
  await horas(a, D1);
  await horas(a, D2);
  await horas(a, FUERA);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Crear un concurso", () => {
  it("nace en BORRADOR con sus ítems y no reserva nada", async () => {
    await propina(D1, 200_000);
    const res = await crear();
    expect(res.status).toBe(201);
    const { contest: c } = await res.json();
    expect(c).toMatchObject({ tenantId: a.tenantId, status: "BORRADOR", payoutMode: "DIVIDIDO", createdById: a.users.proprietario.id });
    expect(c.items.map((i: { name: string; outcome: string }) => [i.name, i.outcome])).toEqual([["Ventas", "PENDIENTE"], ["Postres", "PENDIENTE"]]);
    expect((await dia(a, D1)).reservado).toBe(0);
    expect(await prisma.contestTipReserve.count()).toBe(0);
  });

  it.each([
    ["sin ítems", { items: [] }],
    ["fin anterior al inicio", { startDate: FIN, endDate: INICIO }],
    ["fecha con otro formato", { startDate: "03/03/2025" }],
    ["dos ítems con el mismo nombre", { items: [body().items[0], { ...body().items[1], name: "ventas" }] }],
    ["un ítem con más del 20 %", { items: [{ ...body().items[0], percent: 20.5 }] }],
    ["un ítem con 0 %", { items: [{ ...body().items[0], percent: 0 }] }],
    ["un porcentaje con tres decimales", { items: [{ ...body().items[0], percent: 1.234 }] }],
    ["una meta negativa", { items: [{ ...body().items[0], goalValue: -1 }] }],
    ["modalidad de pago desconocida", { payoutMode: "MENSUAL" }],
    // Antes respondía 500: el recorrido del rango lanzaba una excepción sin atrapar.
    ["un rango de más de 800 días", { startDate: "2025-01-01", endDate: "2027-03-12" }],
  ])("[NEG] %s responde 400", async (_caso, over) => {
    expect((await crear(over)).status).toBe(400);
    expect(await prisma.contest.count()).toBe(0);
  });

  it("[LIM] los ítems de un concurso pueden sumar 20 %, pero no más", async () => {
    const dos = (p1: number, p2: number) => ({ items: [{ ...body().items[0], percent: p1 }, { ...body().items[1], percent: p2 }] });
    expect((await crear(dos(12, 8))).status).toBe(201);
    const pasado = await crear({ name: "Otro", startDate: "2025-05-01", endDate: "2025-05-15", ...dos(12, 8.01) });
    expect(pasado.status).toBe(400);
    expect((await pasado.json()).error.conflicts).toHaveLength(15);
  });

  it("[CP-50] sin sesión 401; sin permiso 403; JSON roto 400", async () => {
    expect((await contests.POST(new Request("http://localhost/api", { method: "POST", body: "{" }))).status).toBe(400);
    session = null;
    expect((await crear()).status).toBe(401);
    expect((await contests.GET(getRequest())).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await crear()).status).toBe(403);
    expect((await contests.GET(getRequest())).status).toBe(403);
  });
});

describe("Activar: el concurso empieza a reservar", () => {
  it("con días ya registrados exige confirmación y muestra el impacto antes de tocar nada", async () => {
    await propina(D1, 200_000);
    const c = await nuevo();

    const sinConfirmar = await activar(c.id);
    expect(sinConfirmar.status).toBe(409);
    const { error } = await sinConfirmar.json();
    expect(error.requiresConfirmation).toBe(true);
    // 7,5 % de 200 000 sale del reparto de los empleados.
    expect(error.preview).toMatchObject({ affectedDays: 1, totalDelta: -15_000 });

    // La vista previa de la ruta de impacto dice lo mismo y tampoco escribe.
    const impacto = await (await impactRoute(getRequest({ action: "activar" }), routeParams({ id: c.id }))).json();
    expect(impacto.preview.rows).toEqual([{ date: D1, totalAmount: 200_000, netBefore: 180_000, netAfter: 165_000, delta: -15_000 }]);
    expect((await dia(a, D1)).reservado).toBe(0);
    expect((await prisma.contest.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("BORRADOR");
  });

  it("al confirmar, reserva sobre los días ya registrados y sobre los que se registren después", async () => {
    await propina(D1, 200_000);
    const c = await nuevo();
    const res = await activar(c.id, { confirmImpact: true });
    expect(res.status).toBe(200);
    expect((await res.json()).changes).toEqual([{ date: D1, netBefore: 180_000, netAfter: 165_000, delta: -15_000 }]);

    expect(await dia(a, D1)).toMatchObject({ menaje: 20_000, reservado: 15_000, neto: 165_000, porItem: { Ventas: 10_000, Postres: 5_000 } });

    // Un día nuevo dentro del rango nace con su reserva; uno fuera del rango, sin ella.
    await propina(D2, 100_000);
    expect(await dia(a, D2)).toMatchObject({ reservado: 7_500, neto: 82_500, porItem: { Ventas: 5_000, Postres: 2_500 } });
    await propina(FUERA, 100_000);
    expect(await dia(a, FUERA)).toMatchObject({ reservado: 0, neto: 90_000, porItem: {} });

    // El aviso del modal de propinas refleja lo que descuenta cada día.
    const aviso = await (await deductionsRoute(getRequest({ date: D2 }))).json();
    expect(aviso).toMatchObject({ menajePercent: 10, contestPercent: 7.5, totalPercent: 17.5 });
    expect(aviso.items.map((i: { itemName: string; frozen: boolean }) => [i.itemName, i.frozen])).toEqual([["Ventas", false], ["Postres", false]]);
  });

  it("sin días registrados en el rango se activa sin pedir confirmación", async () => {
    const c = await nuevo();
    const res = await activar(c.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ACTIVO", changes: [] });
    const guardado = await prisma.contest.findUniqueOrThrow({ where: { id: c.id } });
    expect(guardado.activatedById).toBe(a.users.proprietario.id);
    expect(guardado.activatedAt).not.toBeNull();
  });

  it("[NEG] activar dos veces, o un concurso cancelado, responde 409", async () => {
    const c = await nuevo();
    await activar(c.id);
    expect((await activar(c.id)).status).toBe(409);
    await cancelar(c.id);
    expect((await activar(c.id)).status).toBe(409);
  });

  it("[NEG] dos concursos que se solapan no pueden pasar juntos del 20 % en ningún día", async () => {
    const quince = { items: [{ ...body().items[0], percent: 15 }] };
    const uno = await nuevo(quince);
    const dos = await nuevo({ name: "Solapado", startDate: "2025-03-10", endDate: "2025-03-20", ...quince });
    expect((await activar(uno.id)).status).toBe(200);

    const res = await activar(dos.id);
    expect(res.status).toBe(400);
    const { error } = await res.json();
    // Solo chocan los días comunes: del 10 al 14 de marzo.
    expect(error.conflicts.map((x: { date: string }) => x.date)).toEqual(["2025-03-10", "2025-03-11", "2025-03-12", "2025-03-13", "2025-03-14"]);
    expect(error.conflicts[0].total).toBe(30);
    expect((await prisma.contest.findUniqueOrThrow({ where: { id: dos.id } })).status).toBe("BORRADOR");
  });

  it("[RN-01] el concurso de otro tenant responde 404 y no reserva sobre propinas ajenas", async () => {
    const c = await nuevo();
    await activar(c.id);
    session = b.sessionOf("proprietario");
    expect((await activar(c.id)).status).toBe(404);
    expect((await contest.GET(getRequest(), routeParams({ id: c.id }))).status).toBe(404);
    await horas(b, D1);
    await propina(D1, 100_000);
    expect(await dia(b, D1)).toMatchObject({ reservado: 0, neto: 90_000 });
  });
});

describe("Ítem desierto y cancelación: el dinero vuelve al reparto", () => {
  it("declarar un ítem desierto devuelve solo su reserva y deja el rastro como DEVUELTA", async () => {
    await propina(D1, 200_000);
    await propina(D2, 100_000);
    const c = await nuevo();
    await activar(c.id, { confirmImpact: true });
    const postres = c.items.find((i) => i.name === "Postres")!;

    expect((await desierto(c.id, postres.id, { reason: "Nadie llegó" })).status).toBe(400); // sin confirmar
    const res = await desierto(c.id, postres.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: "DESIERTO", refunded: 7_500 });

    expect(await dia(a, D1)).toMatchObject({ reservado: 10_000, neto: 170_000, porItem: { Ventas: 10_000 }, devueltas: ["Postres"] });
    expect(await dia(a, D2)).toMatchObject({ reservado: 5_000, neto: 85_000, porItem: { Ventas: 5_000 }, devueltas: ["Postres"] });
    expect((await desierto(c.id, postres.id)).status).toBe(409); // ya resuelto
  });

  it("cancelar un concurso activo devuelve toda la reserva; después ya no reserva", async () => {
    await propina(D1, 200_000);
    const c = await nuevo();
    await activar(c.id, { confirmImpact: true });

    expect((await cancelar(c.id, { reason: "Se suspende" })).status).toBe(400); // sin confirmar el impacto
    expect((await cancelar(c.id, { reason: "x", confirmImpact: true })).status).toBe(400); // motivo muy corto
    expect((await dia(a, D1)).reservado).toBe(15_000);

    const res = await cancelar(c.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "CANCELADO", refunded: 15_000, voidedBonuses: 0 });
    expect(await dia(a, D1)).toMatchObject({ reservado: 0, neto: 180_000, porItem: {} });

    await propina(D2, 100_000);
    expect((await dia(a, D2)).reservado).toBe(0);
    const guardado = await prisma.contest.findUniqueOrThrow({ where: { id: c.id } });
    expect(guardado).toMatchObject({ status: "CANCELADO", cancelReason: "Se suspende", cancelledById: a.users.proprietario.id });
    expect((await cancelar(c.id)).status).toBe(409);
  });

  it("solo se elimina un concurso en BORRADOR; uno activo se cancela", async () => {
    const borrador = await nuevo();
    const activo = await nuevo({ name: "Otro", startDate: "2025-04-01", endDate: "2025-04-10" });
    await activar(activo.id);

    expect((await contest.DELETE(jsonRequest("DELETE"), routeParams({ id: activo.id }))).status).toBe(409);
    expect((await contest.DELETE(jsonRequest("DELETE"), routeParams({ id: borrador.id }))).status).toBe(200);
    expect((await prisma.contest.findMany()).map((x) => x.id)).toEqual([activo.id]);
    expect(await prisma.contestItem.count({ where: { contestId: borrador.id } })).toBe(0);
  });
});

describe("Editar la configuración", () => {
  it("en BORRADOR se cambian datos e ítems libremente", async () => {
    const c = await nuevo();
    const put = await contest.PUT(
      jsonRequest("PUT", { name: "Renombrado", startDate: INICIO, endDate: "2025-03-20", payoutMode: "UNICO" }),
      routeParams({ id: c.id }),
    );
    expect(put.status).toBe(200);
    expect((await put.json()).contest).toMatchObject({ name: "Renombrado", endDate: "2025-03-20", payoutMode: "UNICO" });

    const item = { name: "Vinos", goalValue: 3, goalUnit: "botellas", criteria: "MAYOR_VALOR", percent: 4, winnerMode: "GANADOR_UNICO" };
    const add = await addItemRoute(jsonRequest("POST", item), routeParams({ id: c.id }));
    expect(add.status).toBe(201);
    const { item: vinos } = await add.json();
    expect((await addItemRoute(jsonRequest("POST", { ...item, name: "VINOS" }), routeParams({ id: c.id }))).status).toBe(409);
    // 5 + 2,5 + 4 = 11,5 %; un ítem más de 9 % pasaría del tope.
    expect((await addItemRoute(jsonRequest("POST", { ...item, name: "Cocteles", percent: 9 }), routeParams({ id: c.id }))).status).toBe(400);

    const edit = await itemRoute.PUT(jsonRequest("PUT", { ...item, percent: 6 }), routeParams({ id: c.id, itemId: vinos.id }));
    expect(edit.status).toBe(200);
    expect((await edit.json()).item.percent).toBe(6);
    const choca = await itemRoute.PUT(jsonRequest("PUT", { ...item, name: "Ventas" }), routeParams({ id: c.id, itemId: vinos.id }));
    expect(choca.status).toBe(409);

    expect((await itemRoute.DELETE(jsonRequest("DELETE"), routeParams({ id: c.id, itemId: vinos.id }))).status).toBe(200);
    expect(await prisma.contestItem.count({ where: { contestId: c.id } })).toBe(2);
  });

  it("en un concurso activo, cambiar un porcentaje exige confirmar y recalcula los días", async () => {
    await propina(D1, 200_000);
    const c = await nuevo();
    await activar(c.id, { confirmImpact: true });
    const ventas = c.items.find((i) => i.name === "Ventas")!;
    const cambio = { name: "Ventas", goalValue: 10, goalUnit: "unidades", criteria: "MAYOR_VALOR", percent: 10, winnerMode: "GANADOR_UNICO" };

    const sin = await itemRoute.PUT(jsonRequest("PUT", cambio), routeParams({ id: c.id, itemId: ventas.id }));
    expect(sin.status).toBe(409);
    expect((await dia(a, D1)).porItem).toEqual({ Ventas: 10_000, Postres: 5_000 });

    const con = await itemRoute.PUT(jsonRequest("PUT", { ...cambio, confirmImpact: true }), routeParams({ id: c.id, itemId: ventas.id }));
    expect(con.status).toBe(200);
    expect(await dia(a, D1)).toMatchObject({ reservado: 25_000, neto: 155_000, porItem: { Ventas: 20_000, Postres: 5_000 } });

    // Un ítem que ya reservó dinero no se elimina: se declara desierto.
    expect((await itemRoute.DELETE(jsonRequest("DELETE"), routeParams({ id: c.id, itemId: ventas.id }))).status).toBe(409);
  });

  it("acortar el rango de un concurso activo devuelve la reserva de los días que salen", async () => {
    await propina(D1, 200_000);
    await propina(D2, 100_000);
    const c = await nuevo();
    await activar(c.id, { confirmImpact: true });
    const rango = { name: "Concurso de marzo", startDate: INICIO, endDate: D1, payoutMode: "DIVIDIDO" };

    const impacto = await (await impactRoute(getRequest({ action: "rango", startDate: INICIO, endDate: D1 }), routeParams({ id: c.id }))).json();
    expect(impacto.preview.rows.map((r: { date: string; delta: number }) => [r.date, r.delta])).toEqual([[D2, 7_500]]);

    expect((await contest.PUT(jsonRequest("PUT", rango), routeParams({ id: c.id }))).status).toBe(409);
    expect((await contest.PUT(jsonRequest("PUT", { ...rango, confirmImpact: true }), routeParams({ id: c.id }))).status).toBe(200);
    expect((await dia(a, D1)).reservado).toBe(15_000);
    expect(await dia(a, D2)).toMatchObject({ reservado: 0, neto: 90_000, devueltas: ["Ventas", "Postres"] });
  });

  it("[NEG] datos inválidos 400; concurso ajeno 404; acción de impacto desconocida 400", async () => {
    const c = await nuevo();
    const put = (data: unknown) => contest.PUT(jsonRequest("PUT", data), routeParams({ id: c.id }));
    expect((await put({ name: "", startDate: INICIO, endDate: FIN, payoutMode: "UNICO" })).status).toBe(400);
    expect((await put({ name: "X", startDate: FIN, endDate: INICIO, payoutMode: "UNICO" })).status).toBe(400);
    expect((await impactRoute(getRequest({ action: "borrar" }), routeParams({ id: c.id }))).status).toBe(400);
    // Las fechas de la vista previa llegan por la URL: un rango inválido es 400, no 500.
    const rangos: Array<Record<string, string>> = [{ startDate: "ayer" }, { startDate: FIN, endDate: INICIO }, { startDate: "2020-01-01", endDate: "2029-01-01" }];
    for (const rango of rangos) {
      expect((await impactRoute(getRequest({ action: "rango", ...rango }), routeParams({ id: c.id }))).status).toBe(400);
    }
    expect((await put({ name: "X", startDate: "2025-01-01", endDate: "2027-03-12", payoutMode: "UNICO" })).status).toBe(400);
    session = b.sessionOf("proprietario");
    expect((await put({ name: "Intruso", startDate: INICIO, endDate: FIN, payoutMode: "UNICO" })).status).toBe(404);
    expect((await impactRoute(getRequest(), routeParams({ id: c.id }))).status).toBe(404);
    expect((await addItemRoute(jsonRequest("POST", body().items[0]), routeParams({ id: c.id }))).status).toBe(404);
  });
});

describe("Finalizar, adjudicar y pagar", () => {
  /** Concurso activo con dos días de propinas reservados: 300 000 de base. */
  async function activo() {
    await propina(D1, 200_000);
    await propina(D2, 100_000);
    const c = await nuevo();
    await activar(c.id, { confirmImpact: true });
    return { c, ventas: c.items.find((i) => i.name === "Ventas")!, postres: c.items.find((i) => i.name === "Postres")! };
  }

  it("finalizar congela la reserva: corregir después el total del día ya no la mueve", async () => {
    const { c } = await activo();
    const res = await finalizar(c.id);
    expect(res.status).toBe(200);
    // 7,5 % de 300 000 en dos días.
    expect(await res.json()).toMatchObject({ status: "FINALIZADO", reservedAmount: 22_500, tipBase: 600_000, days: 4 });

    const tip = await prisma.tipEntry.findUniqueOrThrow({ where: { tenantId_date: { tenantId: a.tenantId, date: D1 } } });
    expect((await editTip(jsonRequest("PUT", { totalAmount: 400_000 }), routeParams({ id: tip.id }))).status).toBe(200);
    // El menaje sigue al total nuevo; la reserva queda en lo que valía al finalizar.
    expect(await dia(a, D1)).toMatchObject({ total: 400_000, menaje: 40_000, reservado: 15_000, neto: 345_000, porItem: { Ventas: 10_000, Postres: 5_000 } });

    // Un día nuevo dentro del rango ya no reserva para un concurso finalizado.
    await horas(a, "2025-03-06");
    await propina("2025-03-06", 100_000);
    expect((await dia(a, "2025-03-06")).reservado).toBe(0);

    const aviso = await (await deductionsRoute(getRequest({ date: D1 }))).json();
    expect(aviso.items.map((i: { frozen: boolean; frozenAmount: number }) => [i.frozen, i.frozenAmount])).toEqual([[true, 10_000], [true, 5_000]]);

    // Y su configuración ya no se edita.
    const put = await contest.PUT(jsonRequest("PUT", { name: "X", startDate: INICIO, endDate: FIN, payoutMode: "UNICO" }), routeParams({ id: c.id }));
    expect(put.status).toBe(409);
    expect((await addItemRoute(jsonRequest("POST", body().items[0]), routeParams({ id: c.id }))).status).toBe(409);
  });

  it("[NEG] una corrección que no alcanza a cubrir el menaje más lo congelado se rechaza", async () => {
    const { c } = await activo();
    await finalizar(c.id);
    const tip = await prisma.tipEntry.findUniqueOrThrow({ where: { tenantId_date: { tenantId: a.tenantId, date: D1 } } });
    const res = await editTip(jsonRequest("PUT", { totalAmount: 10_000 }), routeParams({ id: tip.id }));
    expect(res.status).toBe(400);
    expect((await dia(a, D1)).total).toBe(200_000);
  });

  it("finalizar antes de la fecha de fin exige confirmarlo", async () => {
    // Un concurso que termina dentro de un año: todavía está en curso.
    const fecha = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
    const c = await nuevo({ name: "En curso", startDate: fecha(-30), endDate: fecha(365), items: [body().items[0]] });
    await activar(c.id);
    const sin = await finalizar(c.id);
    expect(sin.status).toBe(409);
    expect((await sin.json()).error).toMatchObject({ requiresConfirmation: true, earlyFinalize: true });
    expect((await finalizar(c.id, { confirmEarly: true })).status).toBe(200);
    expect((await finalizar(c.id, { confirmEarly: true })).status).toBe(409);
  });

  it("registrar resultados: reemplaza la lista y cuenta quiénes alcanzan la meta", async () => {
    const { c, ventas } = await activo();
    const res = await resultados(c.id, ventas.id, [{ employeeId: a.ana.id, value: 12 }, { employeeId: a.luis.id, value: 8, notes: "Casi" }]);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.qualifiedCount).toBe(1);
    expect(json.results.map((r: { employee: { name: string }; value: number }) => [r.employee.name, r.value])).toEqual([["Ana a", 12], ["Luis a", 8]]);

    // Enviar de nuevo solo a Luis retira a Ana.
    await resultados(c.id, ventas.id, [{ employeeId: a.luis.id, value: 11 }]);
    expect((await prisma.contestItemResult.findMany()).map((r) => [r.employeeId, r.value])).toEqual([[a.luis.id, 11]]);

    expect((await resultados(c.id, ventas.id, [])).status).toBe(400);
    expect((await resultados(c.id, ventas.id, [{ employeeId: a.ana.id, value: 1 }, { employeeId: a.ana.id, value: 2 }])).status).toBe(400);
    expect((await resultados(c.id, ventas.id, [{ employeeId: b.ana.id, value: 1 }])).status).toBe(400);
    expect((await resultados(c.id, "no-existe", [{ employeeId: a.ana.id, value: 1 }])).status).toBe(404);
  });

  it("ciclo completo: el bono es exactamente lo reservado, se paga en dos cuotas y el concurso queda PAGADO", async () => {
    const { c, ventas, postres } = await activo();
    await resultados(c.id, ventas.id, [{ employeeId: a.ana.id, value: 12 }, { employeeId: a.luis.id, value: 8 }]);

    // Solo se adjudica un concurso finalizado.
    expect((await adjudicar(c.id, ventas.id)).status).toBe(409);
    await finalizar(c.id);

    // Postres queda desierto: su reserva vuelve a los empleados aunque el concurso ya esté finalizado.
    expect((await desierto(c.id, postres.id)).status).toBe(200);
    expect(await dia(a, D1)).toMatchObject({ reservado: 10_000, porItem: { Ventas: 10_000 } });

    const res = await adjudicar(c.id, ventas.id);
    expect(res.status).toBe(200);
    const premio = await res.json();
    // 5 % de 200 000 + 5 % de 100 000.
    expect(premio).toMatchObject({ reservedAmount: 15_000, tipBase: 300_000 });
    expect(premio.bonuses).toHaveLength(1);
    expect(premio.bonuses[0]).toMatchObject({ employeeId: a.ana.id, employeeName: "Ana a", amount: 15_000 });
    expect(premio.bonuses[0].installments).toEqual([
      { installment: 1, periodStart: "2025-03-16", periodEnd: "2025-03-31", amount: 7_500 },
      { installment: 2, periodStart: "2025-04-01", periodEnd: "2025-04-15", amount: 7_500 },
    ]);
    expect((await adjudicar(c.id, ventas.id)).status).toBe(409); // ya adjudicado

    const bono = await prisma.contestBonus.findFirstOrThrow({ include: { payments: { orderBy: { installment: "asc" } } } });
    expect(bono).toMatchObject({
      tenantId: a.tenantId, contestName: "Concurso de marzo", itemName: "Ventas", goalSnapshot: "10 unidades",
      percentSnapshot: 5, tipBaseSnapshot: 300_000, reservedAmount: 15_000, resultValue: 12,
      totalAmount: 15_000, paidAmount: 0, status: "PENDIENTE", shareRatio: 1,
    });
    // Lo adjudicado es exactamente lo que se descontó a los empleados.
    const reservado = await prisma.contestTipReserve.aggregate({ where: { contestItemId: ventas.id, status: "RESERVADA" }, _sum: { amount: true } });
    expect(bono.totalAmount).toBe(reservado._sum.amount);
    expect((await prisma.contest.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("FINALIZADO");

    // Listado para el panel, con totales.
    const lista = await (await bonusesRoute(getRequest())).json();
    expect(lista.totals).toEqual({ total: 15_000, paid: 0, pending: 15_000 });
    expect(lista.bonuses[0]).toMatchObject({ pendingAmount: 15_000, employee: { name: "Ana a" } });
    expect((await (await bonusesRoute(getRequest({ employeeId: a.luis.id }))).json()).bonuses).toEqual([]);
    expect((await (await bonusesRoute(getRequest({ from: "2025-03-16", to: "2025-03-31" }))).json()).bonuses).toHaveLength(1);

    const [cuota1, cuota2] = bono.payments;
    const pagar = (paymentId: string) => payRoute(jsonRequest("POST"), routeParams({ id: bono.id, paymentId }));

    // Reprogramar la segunda cuota a otra quincena.
    const mover = (data: unknown, paymentId = cuota2.id) => reschedulePaymentRoute(jsonRequest("PUT", data), routeParams({ id: bono.id, paymentId }));
    expect((await mover({ periodStart: "2025-04-30", periodEnd: "2025-04-16" })).status).toBe(400);
    expect((await mover({ periodStart: "2025-04-16", periodEnd: "2025-04-30" })).status).toBe(200);

    const pago1 = await pagar(cuota1.id);
    expect(pago1.status).toBe(200);
    expect(await pago1.json()).toMatchObject({ paidAmount: 7_500, pendingAmount: 7_500, bonusStatus: "PARCIAL", contestSettled: false });

    // Pagar dos veces la misma cuota no duplica el pago.
    const repetido = await pagar(cuota1.id);
    expect(repetido.status).toBe(409);
    expect((await repetido.json()).error.reason).toBe("YA_PAGADA");
    expect((await prisma.contestBonus.findUniqueOrThrow({ where: { id: bono.id } })).paidAmount).toBe(7_500);
    expect((await mover({ periodStart: "2025-05-01", periodEnd: "2025-05-15" }, cuota1.id)).status).toBe(409); // ya pagada

    // Con bonos pagados, el concurso ya no se cancela.
    expect((await cancelar(c.id)).status).toBe(409);

    // El empleado ve sus cuotas en su portal.
    session = a.sessionOf("empleado");
    const mias = await (await myBonusesRoute(getRequest({ from: "2025-03-16", to: "2025-04-30" }))).json();
    expect(mias.bonuses.map((x: { installment: number; amount: number; totalInstallments: number }) => [x.installment, x.amount, x.totalInstallments]))
      .toEqual([[1, 7_500, 2], [2, 7_500, 2]]);
    expect((await myBonusesRoute(getRequest())).status).toBe(400);
    session = a.sessionOf("admin"); // sin empleado enlazado
    expect((await myBonusesRoute(getRequest({ from: "2025-03-16", to: "2025-04-30" }))).status).toBe(401);

    session = a.sessionOf("proprietario");
    const pago2 = await pagar(cuota2.id);
    expect(await pago2.json()).toMatchObject({ paidAmount: 15_000, pendingAmount: 0, bonusStatus: "PAGADO", contestSettled: true });
    expect((await prisma.contest.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PAGADO");
    expect((await cancelar(c.id)).status).toBe(409);

    // Todo el ciclo dejó las propinas cuadradas.
    await dia(a, D1);
    await dia(a, D2);
    expect(await prisma.auditLog.count({ where: { module: "CONTESTS", action: "PAYMENT", result: "SUCCESS" } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { module: "CONTESTS", action: "PAYMENT", result: "FAILURE" } })).toBe(1);
  });

  it("premio repartido: se divide entre quienes alcanzaron la meta y la suma es exacta", async () => {
    const { c, postres } = await activo();
    await resultados(c.id, postres.id, [{ employeeId: a.ana.id, value: 9 }, { employeeId: a.luis.id, value: 6 }]);
    await finalizar(c.id);
    const premio = await (await adjudicar(c.id, postres.id)).json();
    // 2,5 % de 300 000 = 7 500, entre dos.
    expect(premio.reservedAmount).toBe(7_500);
    expect(premio.bonuses.map((x: { amount: number }) => x.amount).sort()).toEqual([3_750, 3_750]);
    const bonos = await prisma.contestBonus.findMany();
    expect(bonos.reduce((s, x) => s + x.totalAmount, 0)).toBe(7_500);
  });

  it("[NEG] sin nadie que alcance la meta, o con empate en ganador único, no se adjudica", async () => {
    const { c, ventas } = await activo();
    await resultados(c.id, ventas.id, [{ employeeId: a.ana.id, value: 3 }]);
    await finalizar(c.id);
    const nadie = await adjudicar(c.id, ventas.id);
    expect(nadie.status).toBe(400);
    expect((await nadie.json()).error.reason).toBe("SIN_CALIFICADOS");

    await resultados(c.id, ventas.id, [{ employeeId: a.ana.id, value: 15 }, { employeeId: a.luis.id, value: 15 }]);
    const empate = await adjudicar(c.id, ventas.id);
    expect(empate.status).toBe(400);
    expect((await empate.json()).error).toMatchObject({ reason: "EMPATE" });

    // Con un criterio automático la selección manual no desempata: sigue siendo EMPATE.
    const manual = await adjudicar(c.id, ventas.id, { manualEmployeeIds: [a.luis.id] });
    expect(manual.status).toBe(400);
    expect((await manual.json()).error.reason).toBe("EMPATE");
    expect(await prisma.contestBonus.count()).toBe(0);

    // La salida que sí existe: corregir los resultados (se permite con el concurso finalizado).
    await resultados(c.id, ventas.id, [{ employeeId: a.ana.id, value: 15 }, { employeeId: a.luis.id, value: 16 }]);
    const res = await adjudicar(c.id, ventas.id);
    expect(res.status).toBe(200);
    expect((await res.json()).bonuses[0].employeeId).toBe(a.luis.id);
  });

  it("criterio de selección manual: gana quien se elija entre los que alcanzaron la meta", async () => {
    await propina(D1, 200_000);
    const manual = { name: "Mejor servicio", goalValue: 1, goalUnit: "votos", criteria: "SELECCION_MANUAL", percent: 5, winnerMode: "GANADOR_UNICO" };
    const c = await nuevo({ items: [manual] });
    await activar(c.id, { confirmImpact: true });
    const item = c.items[0];
    await resultados(c.id, item.id, [{ employeeId: a.ana.id, value: 3 }, { employeeId: a.luis.id, value: 0 }]);
    await finalizar(c.id);

    const sin = await adjudicar(c.id, item.id);
    expect((await sin.json()).error.reason).toBe("SELECCION_REQUERIDA");
    // Luis no alcanzó la meta: no se le puede elegir.
    const invalida = await adjudicar(c.id, item.id, { manualEmployeeIds: [a.luis.id] });
    expect((await invalida.json()).error.reason).toBe("SELECCION_INVALIDA");

    const res = await adjudicar(c.id, item.id, { manualEmployeeIds: [a.ana.id] });
    expect(res.status).toBe(200);
    expect((await res.json()).bonuses[0]).toMatchObject({ employeeId: a.ana.id, amount: 10_000 });
    // Pago único: una sola cuota en la quincena siguiente al cierre... salvo que sea dividido.
    expect(await prisma.contestBonusPayment.count()).toBe(2);
  });

  it("modalidad de pago única: una sola cuota por el total", async () => {
    await propina(D1, 200_000);
    const c = await nuevo({ payoutMode: "UNICO", items: [body().items[0]] });
    await activar(c.id, { confirmImpact: true });
    await resultados(c.id, c.items[0].id, [{ employeeId: a.ana.id, value: 12 }]);
    await finalizar(c.id);
    const premio = await (await adjudicar(c.id, c.items[0].id)).json();
    expect(premio.bonuses[0].installments).toEqual([{ installment: 1, periodStart: "2025-03-16", periodEnd: "2025-03-31", amount: 10_000 }]);

    const bono = await prisma.contestBonus.findFirstOrThrow({ include: { payments: true } });
    const pago = await payRoute(jsonRequest("POST"), routeParams({ id: bono.id, paymentId: bono.payments[0].id }));
    expect(await pago.json()).toMatchObject({ bonusStatus: "PAGADO", pendingAmount: 0, contestSettled: true });
  });

  it("[NEG] un ítem que no reservó dinero no genera un bono de cero", async () => {
    const c = await nuevo({ name: "Sin propinas", startDate: "2025-06-01", endDate: "2025-06-10", items: [body().items[0]] });
    await activar(c.id);
    await resultados(c.id, c.items[0].id, [{ employeeId: a.ana.id, value: 50 }]);
    await finalizar(c.id);
    const res = await adjudicar(c.id, c.items[0].id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.reason).toBe("SIN_RESERVA");
    expect(await prisma.contestBonus.count()).toBe(0);
  });

  it("anular un bono cancela sus cuotas pendientes y conserva lo ya pagado", async () => {
    const { c, ventas } = await activo();
    await resultados(c.id, ventas.id, [{ employeeId: a.ana.id, value: 12 }]);
    await finalizar(c.id);
    await adjudicar(c.id, ventas.id);
    const bono = await prisma.contestBonus.findFirstOrThrow({ include: { payments: { orderBy: { installment: "asc" } } } });
    await payRoute(jsonRequest("POST"), routeParams({ id: bono.id, paymentId: bono.payments[0].id }));

    const anular = (data: unknown, id = bono.id) => voidBonusRoute(jsonRequest("POST", data), routeParams({ id }));
    expect((await anular({ reason: "x" })).status).toBe(400);
    expect((await anular({ reason: "Error de captura" }, "no-existe")).status).toBe(404);
    const res = await anular({ reason: "Error de captura" });
    expect(res.status).toBe(200);
    expect((await res.json()).cancelledInstallments).toBe(1);

    const guardado = await prisma.contestBonus.findUniqueOrThrow({ where: { id: bono.id }, include: { payments: { orderBy: { installment: "asc" } } } });
    expect(guardado).toMatchObject({ status: "ANULADO", paidAmount: 7_500, voidReason: "Error de captura" });
    expect(guardado.payments.map((p) => p.status)).toEqual(["PAGADO", "ANULADO"]);
    expect((await anular({ reason: "Otra vez" })).status).toBe(409);
    // Una cuota de un bono anulado ya no se paga, y los totales del panel no lo cuentan.
    expect((await payRoute(jsonRequest("POST"), routeParams({ id: bono.id, paymentId: bono.payments[1].id }))).status).toBe(409);
    expect((await (await bonusesRoute(getRequest())).json()).totals).toEqual({ total: 0, paid: 0, pending: 0 });
  });

  it("cancelar un concurso finalizado con bonos sin pagar los anula y devuelve la reserva", async () => {
    const { c, ventas } = await activo();
    await resultados(c.id, ventas.id, [{ employeeId: a.ana.id, value: 12 }]);
    await finalizar(c.id);
    await adjudicar(c.id, ventas.id);

    const res = await cancelar(c.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ refunded: 22_500, voidedBonuses: 1 });
    expect(await dia(a, D1)).toMatchObject({ reservado: 0, neto: 180_000 });
    expect(await dia(a, D2)).toMatchObject({ reservado: 0, neto: 90_000 });
    expect((await prisma.contestBonus.findFirstOrThrow()).status).toBe("ANULADO");
    expect((await prisma.contestBonusPayment.findMany()).every((p) => p.status === "ANULADO")).toBe(true);
  });

  it("[CP-50] las acciones del ciclo exigen sesión y permiso", async () => {
    const { c, ventas } = await activo();
    const llamadas = [
      () => activar(c.id),
      () => finalizar(c.id),
      () => cancelar(c.id),
      () => resultados(c.id, ventas.id, [{ employeeId: a.ana.id, value: 1 }]),
      () => adjudicar(c.id, ventas.id),
      () => desierto(c.id, ventas.id),
      () => impactRoute(getRequest(), routeParams({ id: c.id })),
      () => contest.GET(getRequest(), routeParams({ id: c.id })),
      () => contest.PUT(jsonRequest("PUT", {}), routeParams({ id: c.id })),
      () => contest.DELETE(jsonRequest("DELETE"), routeParams({ id: c.id })),
      () => addItemRoute(jsonRequest("POST", {}), routeParams({ id: c.id })),
      () => itemRoute.PUT(jsonRequest("PUT", {}), routeParams({ id: c.id, itemId: ventas.id })),
      () => itemRoute.DELETE(jsonRequest("DELETE"), routeParams({ id: c.id, itemId: ventas.id })),
      () => bonusesRoute(getRequest()),
      () => voidBonusRoute(jsonRequest("POST", {}), routeParams({ id: "x" })),
      () => payRoute(jsonRequest("POST"), routeParams({ id: "x", paymentId: "y" })),
      () => reschedulePaymentRoute(jsonRequest("PUT", {}), routeParams({ id: "x", paymentId: "y" })),
    ];
    for (const [i, llamada] of llamadas.entries()) {
      session = null;
      expect((await llamada()).status, `llamada ${i} sin sesión`).toBe(401);
      session = a.sessionOf("empleado");
      expect((await llamada()).status, `llamada ${i} sin permiso`).toBe(403);
    }
    session = a.sessionOf("proprietario");
    expect((await prisma.contest.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("ACTIVO");
  });

  it("el detalle y el listado muestran lo reservado por ítem", async () => {
    const { c } = await activo();
    const detalle = await (await contest.GET(getRequest(), routeParams({ id: c.id }))).json();
    expect(detalle.reserves).toHaveLength(4);
    expect(detalle.contest.items).toHaveLength(2);

    const lista = await (await contests.GET(getRequest({ status: "ACTIVO" }))).json();
    expect(lista.contests).toHaveLength(1);
    expect(Object.fromEntries(lista.contests[0].items.map((i: { name: string; reserve: unknown }) => [i.name, i.reserve]))).toEqual({
      Ventas: { reservedAmount: 15_000, tipBase: 300_000, days: 2 },
      Postres: { reservedAmount: 7_500, tipBase: 300_000, days: 2 },
    });
    expect((await (await contests.GET(getRequest({ status: "BORRADOR" }))).json()).contests).toEqual([]);
  });
});
