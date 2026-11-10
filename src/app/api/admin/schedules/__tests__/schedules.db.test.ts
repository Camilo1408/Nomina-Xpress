// Horarios contra una SQLite real: a quién se le avisa al publicar o al editar un horario
// publicado, exclusividad al publicar y cambio de fecha sin perder turnos.
//
// Regla del propietario para el aviso: lo reciben TODOS los que figuran en el horario, con
// turno o con descanso, les haya cambiado algo o no. Quien no tiene nada asignado, no.

import { jsonRequest, resetDb, routeParams, seedTenant, type SeededTenant, type TestSession } from "@/test/db"; // primero: fija la base de pruebas
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

let session: TestSession | null;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));

/** Endpoints a los que se envió un aviso, y cuáles debe rechazar el servicio. */
const enviados: Array<{ endpoint: string; title: string; body: string; url?: string }> = [];
const caducados = new Set<string>();
vi.mock("@/lib/push", () => ({
  sendPushNotification: vi.fn(async (sub: { endpoint: string }, payload: { title: string; body: string; url?: string }) => {
    if (caducados.has(sub.endpoint)) return false;
    enviados.push({ endpoint: sub.endpoint, ...payload });
    return true;
  }),
}));

import { prisma } from "@/lib/db";
import { GET, POST } from "../route";
import { DELETE, PUT } from "../[id]/route";
import { POST as publish } from "../[id]/publish/route";

const SEMANA = "2026-11-02";

let a: SeededTenant;
let b: SeededTenant;
/** Tercer empleado: nunca tiene nada asignado en las pruebas de avisos. */
let sara: { id: string };

/** Crea el usuario y el dispositivo de un empleado; el endpoint es su nombre. */
async function dispositivo(t: SeededTenant, employeeId: string, nombre: string, existingUserId?: string) {
  const userId =
    existingUserId ??
    (await prisma.user.create({ data: { tenantId: t.tenantId, username: `u-${nombre}`, passwordHash: "x", role: "EMPLOYEE", employeeId } })).id;
  await prisma.pushSubscription.create({ data: { tenantId: t.tenantId, userId, endpoint: nombre, p256dh: "k", auth: "a" } });
  return userId;
}

const turno = (employeeId: string, date: string, over: Record<string, unknown> = {}) => ({
  employeeId, date, startTime: "08:00", endTime: "16:00", ...over,
});
const descanso = (employeeId: string, date: string) => ({ employeeId, date, startTime: "", endTime: "", restDay: true });

const crear = (shifts: unknown[], over: Record<string, unknown> = {}) =>
  POST(jsonRequest("POST", { name: "Semana 45", weekStart: SEMANA, shifts, ...over }));
const nuevo = async (shifts: unknown[], over: Record<string, unknown> = {}) => (await (await crear(shifts, over)).json()) as { id: string };
const editar = (id: string, data: unknown) => PUT(jsonRequest("PUT", data), routeParams({ id }));
const publicar = (id: string) => publish(jsonRequest("POST"), routeParams({ id }));
const avisados = () => enviados.map((e) => e.endpoint).sort();

beforeEach(async () => {
  await resetDb();
  enviados.length = 0;
  caducados.clear();
  a = await seedTenant("a");
  b = await seedTenant("b");
  session = a.sessionOf("proprietario");
  sara = await prisma.employee.create({ data: { tenantId: a.tenantId, name: "Sara a" } });
  // Ana ya tiene usuario (el «empleado» de la semilla); Luis y Sara reciben el suyo.
  await dispositivo(a, a.ana.id, "ana", a.users.empleado.id);
  await dispositivo(a, a.luis.id, "luis");
  await dispositivo(a, sara.id, "sara");
  await dispositivo(b, b.ana.id, "ana-de-otro-restaurante", b.users.empleado.id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Aviso al publicar un horario", () => {
  it("llega a quien tiene turno y a quien tiene descanso; no a quien no tiene nada asignado", async () => {
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02"), descanso(a.luis.id, "2026-11-03")]);
    expect(enviados).toEqual([]); // un borrador no avisa a nadie

    expect((await publicar(id)).status).toBe(200);
    expect(avisados()).toEqual(["ana", "luis"]);
    expect(enviados[0]).toMatchObject({ title: "📅 Horario actualizado", url: "/portal/schedule" });
    expect(enviados[0].body).toContain("Semana 45");
  });

  it("un empleado con varios turnos recibe un solo aviso por dispositivo, y uno por cada dispositivo", async () => {
    await dispositivo(a, a.ana.id, "ana-tablet", a.users.empleado.id);
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02"), turno(a.ana.id, "2026-11-03"), descanso(a.ana.id, "2026-11-04")]);
    await publicar(id);
    expect(avisados()).toEqual(["ana", "ana-tablet"]);
  });

  it("despublicar no avisa a nadie", async () => {
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02")]);
    await publicar(id);
    enviados.length = 0;
    expect((await (await publicar(id)).json()).published).toBe(false);
    expect(enviados).toEqual([]);
  });

  it("[RN-01] nunca avisa a dispositivos de otro restaurante ni a un usuario desactivado", async () => {
    await prisma.user.updateMany({ where: { employeeId: a.luis.id }, data: { active: false } });
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02"), turno(a.luis.id, "2026-11-02")]);
    await publicar(id);
    expect(avisados()).toEqual(["ana"]);
  });

  it("una suscripción caducada se retira y no impide avisar a los demás", async () => {
    caducados.add("luis");
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02"), turno(a.luis.id, "2026-11-02")]);
    expect((await publicar(id)).status).toBe(200);
    expect(avisados()).toEqual(["ana"]);
    expect(await prisma.pushSubscription.count({ where: { endpoint: "luis" } })).toBe(0);
    expect(await prisma.pushSubscription.count({ where: { endpoint: "ana" } })).toBe(1);
  });
});

describe("Aviso al editar un horario ya publicado", () => {
  /** Publicado: Ana con turno el lunes, Luis con turno el martes. Sara sin nada. */
  async function publicado() {
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02"), turno(a.luis.id, "2026-11-03")]);
    await publicar(id);
    enviados.length = 0;
    return id;
  }

  it("avisa a quien le cambió el turno, a quien quedó igual y a quien pasó a descanso", async () => {
    const id = await publicado();
    const res = await editar(id, {
      shifts: [
        turno(a.ana.id, "2026-11-02"), // igual que antes
        descanso(a.luis.id, "2026-11-03"), // de turno a descanso
      ],
    });
    expect(res.status).toBe(200);
    expect(avisados()).toEqual(["ana", "luis"]);
    expect(enviados[0].body).toMatch(/Se actualizó el horario "Semana 45"/);
  });

  it("avisa también a quien entra al horario en la edición, y no a quien sigue sin nada", async () => {
    const id = await publicado();
    await editar(id, { shifts: [turno(a.ana.id, "2026-11-02", { startTime: "10:00" }), turno(a.luis.id, "2026-11-03")] });
    expect(avisados()).toEqual(["ana", "luis"]); // Sara sigue sin turno: sin aviso

    enviados.length = 0;
    await editar(id, { shifts: [turno(a.ana.id, "2026-11-02"), turno(a.luis.id, "2026-11-03"), descanso(sara.id, "2026-11-04")] });
    expect(avisados()).toEqual(["ana", "luis", "sara"]);
  });

  it("quien queda sin ninguna celda en el horario editado ya no recibe el aviso", async () => {
    const id = await publicado();
    await editar(id, { shifts: [turno(a.ana.id, "2026-11-02")] });
    expect(avisados()).toEqual(["ana"]);
  });

  it("cambiar solo la fecha de inicio avisa a todos los que figuran; cambiar solo el nombre, a nadie", async () => {
    const id = await publicado();
    await editar(id, { weekStart: "2026-11-09" });
    expect(avisados()).toEqual(["ana", "luis"]);

    enviados.length = 0;
    await editar(id, { name: "Semana 45 (definitivo)" });
    expect(enviados).toEqual([]);
  });

  it("editar un borrador no avisa a nadie", async () => {
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02")]);
    await editar(id, { shifts: [turno(a.ana.id, "2026-11-02"), turno(a.luis.id, "2026-11-03")] });
    expect(enviados).toEqual([]);
  });

  it("si el servicio de avisos falla, el horario se guarda igual", async () => {
    const id = await publicado();
    const { sendPushNotification } = await import("@/lib/push");
    vi.mocked(sendPushNotification).mockRejectedValueOnce(new Error("servicio caído"));
    const res = await editar(id, { shifts: [turno(a.ana.id, "2026-11-05")] });
    expect(res.status).toBe(200);
    expect((await prisma.scheduleShift.findMany({ where: { scheduleId: id } })).map((s) => s.date)).toEqual(["2026-11-05"]);
  });
});

describe("Guardar y cambiar la fecha de un horario", () => {
  it("un descanso se guarda sin horas reales y un turno partido con sus dos tramos", async () => {
    const { id } = await nuevo([
      descanso(a.ana.id, "2026-11-02"),
      turno(a.luis.id, "2026-11-02", { endTime: "12:00", startTime2: "14:00", endTime2: "18:00" }),
    ]);
    const filas = await prisma.scheduleShift.findMany({ where: { scheduleId: id }, orderBy: { employeeId: "asc" } });
    const deAna = filas.find((f) => f.employeeId === a.ana.id)!;
    const deLuis = filas.find((f) => f.employeeId === a.luis.id)!;
    expect(deAna).toMatchObject({ restDay: true, startTime2: null, endTime2: null });
    expect(deLuis).toMatchObject({ restDay: false, startTime: "08:00", endTime: "12:00", startTime2: "14:00", endTime2: "18:00" });
  });

  it("mover el horario a otra semana conserva todos los turnos, en sus fechas nuevas", async () => {
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02"), descanso(a.luis.id, "2026-11-08")]);
    // Lo que envía la pantalla al cambiar la fecha de inicio: los mismos turnos, corridos.
    const res = await editar(id, {
      weekStart: "2026-09-14",
      shifts: [turno(a.ana.id, "2026-09-14"), descanso(a.luis.id, "2026-09-20")],
    });
    expect(res.status).toBe(200);
    expect((await prisma.schedule.findUniqueOrThrow({ where: { id } })).weekStart).toBe("2026-09-14");
    const filas = await prisma.scheduleShift.findMany({ where: { scheduleId: id }, orderBy: { date: "asc" } });
    expect(filas.map((f) => [f.employeeId, f.date, f.restDay])).toEqual([
      [a.ana.id, "2026-09-14", false],
      [a.luis.id, "2026-09-20", true],
    ]);
  });

  it("publicar un horario despublica el que estaba publicado", async () => {
    const uno = await nuevo([turno(a.ana.id, "2026-11-02")]);
    const dos = await nuevo([turno(a.ana.id, "2026-11-09")], { name: "Semana 46", weekStart: "2026-11-09" });
    await publicar(uno.id);
    const res = await (await publicar(dos.id)).json();
    expect(res.unpublished).toEqual(["Semana 45"]);
    const estado = Object.fromEntries((await prisma.schedule.findMany()).map((s) => [s.name, s.published]));
    expect(estado).toEqual({ "Semana 45": false, "Semana 46": true });
  });

  it("[RN-01] listar, editar, publicar y eliminar no alcanzan el horario de otro restaurante", async () => {
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02")]);
    session = b.sessionOf("proprietario");
    expect(await (await GET()).json()).toEqual([]);
    expect((await editar(id, { name: "Intruso" })).status).toBe(404);
    expect((await publicar(id)).status).toBe(404);
    await DELETE(jsonRequest("DELETE"), routeParams({ id }));
    expect(await prisma.schedule.count()).toBe(1);
    expect(enviados).toEqual([]);
  });

  it("[NEG] un empleado de otro restaurante en los turnos responde 400", async () => {
    expect((await crear([turno(b.ana.id, "2026-11-02")])).status).toBe(400);
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02")]);
    expect((await editar(id, { shifts: [turno(b.ana.id, "2026-11-02")] })).status).toBe(400);
    expect(await prisma.scheduleShift.count()).toBe(1);
  });

  it("eliminar borra el horario con sus turnos y deja auditoría", async () => {
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02")]);
    expect((await DELETE(jsonRequest("DELETE"), routeParams({ id }))).status).toBe(200);
    expect(await prisma.schedule.count()).toBe(0);
    expect(await prisma.scheduleShift.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { module: "SCHEDULES", action: "DELETE" } })).toBe(1);
  });

  it("[CP-50] sin sesión 401; un empleado sin permiso 403", async () => {
    const { id } = await nuevo([turno(a.ana.id, "2026-11-02")]);
    const llamadas = [
      () => GET(),
      () => crear([]),
      () => editar(id, {}),
      () => publicar(id),
      () => DELETE(jsonRequest("DELETE"), routeParams({ id })),
    ];
    for (const llamada of llamadas) {
      session = null;
      expect((await llamada()).status).toBe(401);
      session = a.sessionOf("empleado");
      expect((await llamada()).status).toBe(403);
    }
    expect(await prisma.schedule.count()).toBe(1);
  });
});
