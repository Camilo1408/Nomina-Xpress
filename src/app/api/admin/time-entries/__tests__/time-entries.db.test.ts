// Registro de horas contra una SQLite real: reglas de turno (RN de shift-times), día
// especial calculado en el servidor, aislamiento por tenant y recálculo de propinas.

import { getRequest, jsonRequest, resetDb, routeParams, seedTenant, type SeededTenant, type TestSession } from "@/test/db"; // primero: fija la base de pruebas
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

let session: TestSession | null;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));

import { prisma } from "@/lib/db";
import { GET, POST } from "../route";
import { DELETE, PUT } from "../[id]/route";

// 2026-11-04 es miércoles laborable; 2026-11-08 es domingo; 2026-11-02 es festivo nacional.
const DIA = "2026-11-04";
// Hora de Colombia explícita: las reglas de turno se evalúan en America/Bogota, y así la
// prueba da lo mismo en una máquina en UTC (el CI) que en una en Bogotá.
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00-05:00`;

const crear = (body: unknown) => POST(jsonRequest("POST", body));
const editar = (id: string, body: unknown) => PUT(jsonRequest("PUT", body), routeParams({ id }));
const borrar = (id: string) => DELETE(jsonRequest("DELETE"), routeParams({ id }));

let a: SeededTenant;
let b: SeededTenant;

beforeEach(async () => {
  await resetDb();
  a = await seedTenant("a");
  b = await seedTenant("b");
  session = a.sessionOf("proprietario");
});

afterAll(async () => {
  await prisma.$disconnect();
});

const turno = (over: Record<string, unknown> = {}) => ({
  employeeId: a.ana.id,
  date: DIA,
  checkIn: at(DIA, "08:00"),
  checkOut: at(DIA, "16:00"),
  ...over,
});

describe("POST /api/admin/time-entries", () => {
  it("guarda el turno del tenant de la sesión y deja auditoría", async () => {
    const res = await crear(turno({ notes: "Apertura" }));
    expect(res.status).toBe(201);

    const [entry] = await prisma.timeEntry.findMany();
    expect(entry).toMatchObject({ tenantId: a.tenantId, employeeId: a.ana.id, date: DIA, isSpecial: false, notes: "Apertura" });

    const [log] = await prisma.auditLog.findMany();
    expect(log).toMatchObject({ tenantId: a.tenantId, action: "CREATE", module: "TIME_ENTRIES", entityId: entry.id });
  });

  it("[RN-03] `isSpecial` lo decide el servidor: domingo, festivo nacional y festivo del cliente", async () => {
    await prisma.holiday.create({ data: { tenantId: a.tenantId, name: "Aniversario", month: 11, day: 5, year: null } });
    const casos: Array<[string, boolean]> = [
      ["2026-11-04", false], // miércoles
      ["2026-11-08", true], // domingo
      ["2026-11-02", true], // festivo nacional (Todos los Santos, trasladado)
      ["2026-11-05", true], // festivo propio del cliente
    ];
    for (const [date, especial] of casos) {
      const res = await crear(turno({ date, checkIn: at(date, "08:00"), checkOut: at(date, "12:00"), isSpecial: !especial }));
      expect(res.status, date).toBe(201);
      expect((await res.json()).isSpecial, date).toBe(especial);
    }
  });

  it("[NEG] el festivo de otro cliente no vuelve especial el día", async () => {
    await prisma.holiday.create({ data: { tenantId: b.tenantId, name: "Ajeno", month: 11, day: 4, year: null } });
    expect((await (await crear(turno())).json()).isSpecial).toBe(false);
  });

  it("[NEG] un empleado de otro tenant responde 404 y no guarda nada", async () => {
    const res = await crear(turno({ employeeId: b.ana.id }));
    expect(res.status).toBe(404);
    expect(await prisma.timeEntry.count()).toBe(0);
  });

  it("[NEG] salida anterior a la entrada responde 400", async () => {
    const res = await crear(turno({ checkIn: at(DIA, "16:00"), checkOut: at(DIA, "08:00") }));
    expect(res.status).toBe(400);
    expect(await prisma.timeEntry.count()).toBe(0);
  });

  it("[LIM] un turno puede cruzar la medianoche hasta las 02:00; después responde 400", async () => {
    const siguiente = "2026-11-05";
    const ok = await crear(turno({ checkIn: at(DIA, "18:00"), checkOut: at(siguiente, "02:00") }));
    expect(ok.status).toBe(201);
    const tarde = await crear(turno({ employeeId: a.luis.id, checkIn: at(DIA, "18:00"), checkOut: at(siguiente, "02:01") }));
    expect(tarde.status).toBe(400);
  });

  it("[NEG] una fecha con formato inválido o un cuerpo sin empleado responden 400", async () => {
    expect((await crear(turno({ date: "04/11/2026" }))).status).toBe(400);
    expect((await crear({ date: DIA, checkIn: at(DIA, "08:00") })).status).toBe(400);
  });

  it("[NEG] un turno que se solapa con otro del mismo día responde 409", async () => {
    expect((await crear(turno())).status).toBe(201);
    const res = await crear(turno({ checkIn: at(DIA, "15:00"), checkOut: at(DIA, "18:00") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/superpone/);
    expect(await prisma.timeEntry.count()).toBe(1);
  });

  it("[LIM] dos turnos por día se aceptan; el tercero responde 409", async () => {
    expect((await crear(turno({ checkIn: at(DIA, "06:00"), checkOut: at(DIA, "09:00") }))).status).toBe(201);
    expect((await crear(turno({ checkIn: at(DIA, "10:00"), checkOut: at(DIA, "13:00") }))).status).toBe(201);
    const res = await crear(turno({ checkIn: at(DIA, "14:00"), checkOut: at(DIA, "17:00") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/2 registros/);
  });

  it("[LIM] 15 horas en el día se aceptan; pasar de 15 responde 409", async () => {
    // 06:00–14:00 (8 h) + 15:00–22:00 (7 h) = 15 h exactas.
    expect((await crear(turno({ checkIn: at(DIA, "06:00"), checkOut: at(DIA, "14:00") }))).status).toBe(201);
    expect((await crear(turno({ employeeId: a.luis.id, checkIn: at(DIA, "06:00"), checkOut: at(DIA, "14:00") }))).status).toBe(201);

    expect((await crear(turno({ checkIn: at(DIA, "15:00"), checkOut: at(DIA, "22:00") }))).status).toBe(201);
    const res = await crear(turno({ employeeId: a.luis.id, checkIn: at(DIA, "15:00"), checkOut: at(DIA, "22:30") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/máximo de 15 h/);
  });

  it("el tope de horas es por empleado: el turno de otro no cuenta", async () => {
    expect((await crear(turno({ checkIn: at(DIA, "06:00"), checkOut: at(DIA, "20:00") }))).status).toBe(201);
    expect((await crear(turno({ employeeId: a.luis.id, checkIn: at(DIA, "06:00"), checkOut: at(DIA, "20:00") }))).status).toBe(201);
  });

  it("[CP-50] sin sesión responde 401 y un empleado sin permiso 403", async () => {
    session = null;
    expect((await crear(turno())).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await crear(turno())).status).toBe(403);
    expect(await prisma.timeEntry.count()).toBe(0);
  });

  it("[CP-49] un cuerpo que no es JSON responde 400", async () => {
    const res = await POST(new Request("http://localhost/api", { method: "POST", body: "{no es json" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/time-entries", () => {
  it("[RN-01] solo devuelve los registros del tenant de la sesión, filtrados por rango y empleado", async () => {
    await crear(turno());
    await crear(turno({ employeeId: a.luis.id, date: "2026-11-10", checkIn: at("2026-11-10", "08:00"), checkOut: at("2026-11-10", "12:00") }));
    session = b.sessionOf("proprietario");
    await crear({ employeeId: b.ana.id, date: DIA, checkIn: at(DIA, "08:00"), checkOut: at(DIA, "12:00") });

    session = a.sessionOf("proprietario");
    const todos = await (await GET(getRequest())).json();
    expect(todos).toHaveLength(2);
    expect(todos.every((e: { tenantId: string }) => e.tenantId === a.tenantId)).toBe(true);

    const rango = await (await GET(getRequest({ from: "2026-11-01", to: "2026-11-05" }))).json();
    expect(rango.map((e: { date: string }) => e.date)).toEqual([DIA]);

    const deLuis = await (await GET(getRequest({ employeeId: a.luis.id }))).json();
    expect(deLuis).toHaveLength(1);
    expect(deLuis[0].employee.name).toBe("Luis a");
  });

  it("[CP-50] sin sesión 401; sin permiso 403", async () => {
    session = null;
    expect((await GET(getRequest())).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await GET(getRequest())).status).toBe(403);
  });
});

describe("PUT /api/admin/time-entries/[id]", () => {
  const nuevo = async (over: Record<string, unknown> = {}) => (await (await crear(turno(over))).json()) as { id: string };

  it("edita las horas y recalcula `isSpecial` al mover el registro a un domingo", async () => {
    const { id } = await nuevo();
    const res = await editar(id, { date: "2026-11-08", checkIn: at("2026-11-08", "09:00"), checkOut: at("2026-11-08", "13:00"), notes: "Movido" });
    expect(res.status).toBe(200);
    const entry = await prisma.timeEntry.findUniqueOrThrow({ where: { id } });
    expect(entry).toMatchObject({ date: "2026-11-08", isSpecial: true, notes: "Movido" });
    expect(await prisma.auditLog.count({ where: { action: "UPDATE", module: "TIME_ENTRIES" } })).toBe(1);
  });

  it("agrega y quita el segundo tramo del turno", async () => {
    const { id } = await nuevo({ checkOut: at(DIA, "12:00") });
    expect((await editar(id, { checkIn2: at(DIA, "14:00"), checkOut2: at(DIA, "18:00") })).status).toBe(200);
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id } })).checkOut2).not.toBeNull();
    expect((await editar(id, { checkIn2: null, checkOut2: null })).status).toBe(200);
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id } })).checkIn2).toBeNull();
  });

  it("[NEG] el servidor revalida al editar: salida anterior a la entrada responde 400", async () => {
    const { id } = await nuevo();
    expect((await editar(id, { checkOut: at(DIA, "07:00") })).status).toBe(400);
    expect((await editar(id, { checkIn2: at(DIA, "20:00"), checkOut2: at(DIA, "19:00") })).status).toBe(400);
    const entry = await prisma.timeEntry.findUniqueOrThrow({ where: { id } });
    expect(entry.checkOut?.toISOString()).toBe(new Date(at(DIA, "16:00")).toISOString());
  });

  it("[NEG] al editar tampoco se puede pasar de 15 horas en el día", async () => {
    await nuevo({ checkIn: at(DIA, "06:00"), checkOut: at(DIA, "14:00") });
    const { id } = await nuevo({ checkIn: at(DIA, "15:00"), checkOut: at(DIA, "20:00") });
    const res = await editar(id, { checkOut: at(DIA, "22:30") });
    expect(res.status).toBe(409);
  });

  it("[NEG] mover un turno a un día donde se solapa, o que ya tiene dos turnos, responde 409", async () => {
    const otro = "2026-11-06";
    await nuevo({ date: otro, checkIn: at(otro, "08:00"), checkOut: at(otro, "12:00") });
    const { id } = await nuevo({ checkIn: at(DIA, "10:00"), checkOut: at(DIA, "14:00") });

    // Se solapa con 08:00–12:00 del día destino.
    const solapa = await editar(id, { date: otro, checkIn: at(otro, "10:00"), checkOut: at(otro, "14:00") });
    expect(solapa.status).toBe(409);
    expect((await solapa.json()).error).toMatch(/superpone/);

    await nuevo({ date: otro, checkIn: at(otro, "13:00"), checkOut: at(otro, "15:00") });
    const lleno = await editar(id, { date: otro, checkIn: at(otro, "16:00"), checkOut: at(otro, "18:00") });
    expect(lleno.status).toBe(409);
    expect((await lleno.json()).error).toMatch(/2 registros/);
  });

  it("[NEG] reasignar a un empleado de otro tenant responde 404", async () => {
    const { id } = await nuevo();
    expect((await editar(id, { employeeId: b.ana.id })).status).toBe(404);
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id } })).employeeId).toBe(a.ana.id);
  });

  it("reasignar a otro empleado del mismo tenant funciona", async () => {
    const { id } = await nuevo();
    expect((await editar(id, { employeeId: a.luis.id })).status).toBe(200);
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id } })).employeeId).toBe(a.luis.id);
  });

  it("[RN-01] el registro de otro tenant no existe para esta sesión: 404", async () => {
    const { id } = await nuevo();
    session = b.sessionOf("proprietario");
    expect((await editar(id, { notes: "intruso" })).status).toBe(404);
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id } })).notes).toBeNull();
  });

  it("[CP-50] sin sesión 401; sin permiso 403; cuerpo inválido 400", async () => {
    const { id } = await nuevo();
    expect((await editar(id, { date: "ayer" })).status).toBe(400);
    session = null;
    expect((await editar(id, {})).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await editar(id, {})).status).toBe(403);
  });
});

describe("DELETE /api/admin/time-entries/[id]", () => {
  it("borra el registro y deja auditoría con lo que había", async () => {
    const { id } = await (await crear(turno())).json();
    expect((await borrar(id)).status).toBe(200);
    expect(await prisma.timeEntry.count()).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "DELETE" } });
    expect(log.entityLabel).toBe(`Ana a — ${DIA}`);
  });

  it("[RN-01] no borra el registro de otro tenant", async () => {
    const { id } = await (await crear(turno())).json();
    session = b.sessionOf("proprietario");
    expect((await borrar(id)).status).toBe(200);
    expect(await prisma.timeEntry.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "DELETE" } })).toBe(0);
  });

  it("[CP-50] sin sesión 401; sin permiso 403", async () => {
    const { id } = await (await crear(turno())).json();
    session = null;
    expect((await borrar(id)).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await borrar(id)).status).toBe(403);
    expect(await prisma.timeEntry.count()).toBe(1);
  });
});

describe("Propinas al cambiar las horas", () => {
  it("crear, editar y borrar un turno recalcula el reparto del día; el total siempre cuadra", async () => {
    await crear(turno({ checkIn: at(DIA, "08:00"), checkOut: at(DIA, "12:00") })); // Ana 4 h
    const tip = await prisma.tipEntry.create({
      data: { tenantId: a.tenantId, date: DIA, totalAmount: 100_000, menaje: 0, netAmount: 100_000, periodStart: "2026-11-01", periodEnd: "2026-11-15" },
    });

    const reparto = async () => {
      const entry = await prisma.tipEntry.findUniqueOrThrow({ where: { id: tip.id }, include: { distributions: true } });
      // Invariante del módulo: total = menaje + reserva de concursos + neto.
      expect(entry.menaje + entry.contestReserved + entry.netAmount).toBeCloseTo(entry.totalAmount, 6);
      const repartido = entry.distributions.reduce((s, d) => s + d.amount, 0);
      if (entry.distributions.length > 0) expect(repartido).toBeCloseTo(entry.netAmount, 0);
      return Object.fromEntries(entry.distributions.map((d) => [d.employeeId, d.hoursWorked]));
    };

    // Entra Luis con 4 h: el reparto pasa a tener a los dos.
    const luis = await (await crear(turno({ employeeId: a.luis.id, checkIn: at(DIA, "08:00"), checkOut: at(DIA, "12:00") }))).json();
    expect(await reparto()).toEqual({ [a.ana.id]: 4, [a.luis.id]: 4 });

    // Luis pasa a 6 h.
    await editar(luis.id, { checkOut: at(DIA, "14:00") });
    expect(await reparto()).toEqual({ [a.ana.id]: 4, [a.luis.id]: 6 });

    // Se borra el turno de Luis: queda solo Ana.
    await borrar(luis.id);
    expect(await reparto()).toEqual({ [a.ana.id]: 4 });
  });
});
