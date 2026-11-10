// Festivos propios del cliente contra una SQLite real: crear, editar o eliminar un
// festivo recalcula `isSpecial` en los turnos ya registrados de las fechas afectadas.

import { jsonRequest, resetDb, routeParams, seedTenant, type SeededTenant, type TestSession } from "@/test/db"; // primero: fija la base de pruebas
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

let session: TestSession | null;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));

import { prisma } from "@/lib/db";
import { GET, POST } from "../route";
import { DELETE, PUT } from "../[id]/route";

const crear = (body: unknown) => POST(jsonRequest("POST", body));
const editar = (id: string, body: unknown) => PUT(jsonRequest("PUT", body), routeParams({ id }));
const borrar = (id: string) => DELETE(jsonRequest("DELETE"), routeParams({ id }));

let a: SeededTenant;
let b: SeededTenant;

/** Un turno de 4 h en la fecha dada, guardado como día normal. */
const turno = (t: SeededTenant, date: string) =>
  prisma.timeEntry.create({
    data: {
      tenantId: t.tenantId, employeeId: t.ana.id, date, isSpecial: false,
      checkIn: new Date(`${date}T08:00:00-05:00`), checkOut: new Date(`${date}T12:00:00-05:00`),
    },
  });

const especiales = async (t: SeededTenant) =>
  Object.fromEntries(
    (await prisma.timeEntry.findMany({ where: { tenantId: t.tenantId }, orderBy: { date: "asc" } })).map((e) => [e.date, e.isSpecial]),
  );

beforeEach(async () => {
  await resetDb();
  a = await seedTenant("a");
  b = await seedTenant("b");
  session = a.sessionOf("proprietario");
});

afterAll(async () => {
  await prisma.$disconnect();
});

// 4 y 5 de noviembre de 2026 y 4 de noviembre de 2025 son días laborables normales.
describe("POST /api/admin/holidays", () => {
  it("un festivo que se repite cada año vuelve especiales los turnos de esa fecha en cualquier año", async () => {
    await turno(a, "2025-11-04");
    await turno(a, "2026-11-04");
    await turno(a, "2026-11-05");
    await turno(b, "2026-11-04");

    const res = await crear({ name: "Aniversario", month: 11, day: 4 });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: "Aniversario", year: null, recalculated: 2, tenantId: a.tenantId });

    expect(await especiales(a)).toEqual({ "2025-11-04": true, "2026-11-04": true, "2026-11-05": false });
    // El festivo de un cliente no toca los turnos de otro.
    expect(await especiales(b)).toEqual({ "2026-11-04": false });
    expect(await prisma.auditLog.count({ where: { action: "CREATE", module: "HOLIDAYS" } })).toBe(1);
  });

  it("un festivo puntual solo afecta ese año", async () => {
    await turno(a, "2025-11-04");
    await turno(a, "2026-11-04");
    const res = await crear({ name: "Inauguración", month: 11, day: 4, year: 2026 });
    expect((await res.json()).recalculated).toBe(1);
    expect(await especiales(a)).toEqual({ "2025-11-04": false, "2026-11-04": true });
  });

  it("[NEG] la misma fecha dos veces responde 409; puntual y recurrente son fechas distintas", async () => {
    expect((await crear({ name: "Uno", month: 11, day: 4 })).status).toBe(201);
    expect((await crear({ name: "Repetido", month: 11, day: 4 })).status).toBe(409);
    expect((await crear({ name: "Puntual", month: 11, day: 4, year: 2026 })).status).toBe(201);
    expect((await crear({ name: "Puntual otra vez", month: 11, day: 4, year: 2026 })).status).toBe(409);
    expect(await prisma.holiday.count()).toBe(2);
  });

  it("[RN-01] la misma fecha en otro tenant no choca", async () => {
    expect((await crear({ name: "Mío", month: 11, day: 4 })).status).toBe(201);
    session = b.sessionOf("proprietario");
    expect((await crear({ name: "Suyo", month: 11, day: 4 })).status).toBe(201);
  });

  it.each([
    ["30 de febrero", { name: "Imposible", month: 2, day: 30 }],
    ["29 de febrero en un año no bisiesto", { name: "Bisiesto", month: 2, day: 29, year: 2026 }],
    ["mes 13", { name: "Mes", month: 13, day: 1 }],
    ["día 0", { name: "Día", month: 1, day: 0 }],
    ["año fuera de rango", { name: "Año", month: 1, day: 1, year: 1999 }],
    ["nombre de una letra", { name: "A", month: 1, day: 2 }],
  ])("[NEG] %s responde 400", async (_caso, body) => {
    expect((await crear(body)).status).toBe(400);
    expect(await prisma.holiday.count()).toBe(0);
  });

  it("[LIM] el 29 de febrero vale en un año bisiesto y como festivo recurrente", async () => {
    expect((await crear({ name: "Bisiesto", month: 2, day: 29, year: 2028 })).status).toBe(201);
    expect((await crear({ name: "Cada bisiesto", month: 2, day: 29 })).status).toBe(201);
  });

  it("[CP-50] sin sesión 401; sin permiso 403", async () => {
    session = null;
    expect((await crear({ name: "Nadie", month: 11, day: 4 })).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await crear({ name: "Empleado", month: 11, day: 4 })).status).toBe(403);
  });
});

describe("GET /api/admin/holidays", () => {
  it("[RN-01] lista los del tenant ordenados por mes y día", async () => {
    await crear({ name: "Diciembre", month: 12, day: 1 });
    await crear({ name: "Marzo", month: 3, day: 15 });
    await crear({ name: "Marzo temprano", month: 3, day: 2 });
    session = b.sessionOf("proprietario");
    await crear({ name: "Ajeno", month: 1, day: 10 });

    session = a.sessionOf("proprietario");
    const lista = await (await GET()).json();
    expect(lista.map((h: { name: string }) => h.name)).toEqual(["Marzo temprano", "Marzo", "Diciembre"]);
  });

  it("[CP-50] sin sesión 401; sin permiso 403", async () => {
    session = null;
    expect((await GET()).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await GET()).status).toBe(403);
  });
});

describe("PUT /api/admin/holidays/[id]", () => {
  it("mover el festivo quita lo especial de la fecha vieja y lo pone en la nueva", async () => {
    await turno(a, "2026-11-04");
    await turno(a, "2026-11-05");
    const { id } = await (await crear({ name: "Aniversario", month: 11, day: 4 })).json();
    expect(await especiales(a)).toEqual({ "2026-11-04": true, "2026-11-05": false });

    const res = await editar(id, { name: "Aniversario", month: 11, day: 5 });
    expect(res.status).toBe(200);
    expect((await res.json()).recalculated).toBe(2);
    expect(await especiales(a)).toEqual({ "2026-11-04": false, "2026-11-05": true });
  });

  it("[NEG] moverlo a la fecha de otro festivo responde 409; conservar su propia fecha no", async () => {
    const { id } = await (await crear({ name: "Uno", month: 11, day: 4 })).json();
    await crear({ name: "Dos", month: 11, day: 5 });
    expect((await editar(id, { name: "Uno", month: 11, day: 5 })).status).toBe(409);
    expect((await editar(id, { name: "Uno renombrado", month: 11, day: 4 })).status).toBe(200);
    expect((await prisma.holiday.findUniqueOrThrow({ where: { id } })).name).toBe("Uno renombrado");
  });

  it("[NEG] fecha inválida 400; festivo de otro tenant 404; sin sesión 401; sin permiso 403", async () => {
    const { id } = await (await crear({ name: "Uno", month: 11, day: 4 })).json();
    expect((await editar(id, { name: "Uno", month: 2, day: 31 })).status).toBe(400);
    session = b.sessionOf("proprietario");
    expect((await editar(id, { name: "Intruso", month: 11, day: 4 })).status).toBe(404);
    session = null;
    expect((await editar(id, { name: "Nadie", month: 11, day: 4 })).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await editar(id, { name: "Empleado", month: 11, day: 4 })).status).toBe(403);
    expect((await prisma.holiday.findUniqueOrThrow({ where: { id } })).name).toBe("Uno");
  });
});

describe("DELETE /api/admin/holidays/[id]", () => {
  it("al eliminar, los turnos dejan de ser especiales, salvo que el día lo sea por otra razón", async () => {
    await turno(a, "2026-11-04"); // miércoles
    await turno(a, "2026-11-08"); // domingo
    const mie = await (await crear({ name: "Miércoles", month: 11, day: 4, year: 2026 })).json();
    const dom = await (await crear({ name: "Domingo", month: 11, day: 8, year: 2026 })).json();
    expect(await especiales(a)).toEqual({ "2026-11-04": true, "2026-11-08": true });

    expect((await borrar(mie.id)).status).toBe(200);
    expect((await borrar(dom.id)).status).toBe(200);
    expect(await especiales(a)).toEqual({ "2026-11-04": false, "2026-11-08": true });
    expect(await prisma.holiday.count()).toBe(0);
  });

  it("[NEG] festivo de otro tenant 404; sin sesión 401; sin permiso 403", async () => {
    const { id } = await (await crear({ name: "Uno", month: 11, day: 4 })).json();
    session = b.sessionOf("proprietario");
    expect((await borrar(id)).status).toBe(404);
    session = null;
    expect((await borrar(id)).status).toBe(401);
    session = a.sessionOf("empleado");
    expect((await borrar(id)).status).toBe(403);
    expect(await prisma.holiday.count()).toBe(1);
  });
});
