// Bonos y descuentos contra una SQLite real. Las dos familias de rutas son gemelas, así
// que las mismas pruebas corren sobre ambas: lo que se rompa en una y no en la otra salta.

import { jsonRequest, resetDb, routeParams, seedTenant, type SeededTenant, type TestSession } from "@/test/db"; // primero: fija la base de pruebas
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

let session: TestSession | null;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));

import { prisma } from "@/lib/db";
import * as bonusList from "../route";
import * as bonusItem from "../[id]/route";
import * as discountList from "../../discounts/route";
import * as discountItem from "../../discounts/[id]/route";

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

const estandar = (over: Record<string, unknown> = {}) => ({
  name: "Puntualidad",
  valueType: "STANDARD",
  amount: 50_000,
  assignmentType: "ALL",
  frequency: "BIWEEKLY",
  ...over,
});

interface Row {
  id: string;
  tenantId: string;
  name: string;
  amount: number;
  valueType: string;
  assignmentType: string;
  frequency: string;
  monthlyMode: string | null;
  active: boolean;
  createdById: string | null;
  assignments: Array<{ employeeId: string; amount: number | null; tenantId: string }>;
}

const familias = [
  {
    nombre: "bonos",
    modulo: "BONUSES",
    list: bonusList,
    item: bonusItem,
    rows: (): Promise<Row[]> => prisma.bonus.findMany({ include: { assignments: true }, orderBy: { createdAt: "asc" } }),
  },
  {
    nombre: "descuentos",
    modulo: "DISCOUNTS",
    list: discountList,
    item: discountItem,
    rows: (): Promise<Row[]> => prisma.discount.findMany({ include: { assignments: true }, orderBy: { createdAt: "asc" } }),
  },
];

describe.each(familias)("Rutas de $nombre", ({ list, item, rows, modulo }) => {
  const crear = (body: unknown) => list.POST(jsonRequest("POST", body));
  const editar = (id: string, body: unknown) => item.PUT(jsonRequest("PUT", body), routeParams({ id }));
  const activar = (id: string, body: unknown) => item.PATCH(jsonRequest("PATCH", body), routeParams({ id }));
  const borrar = (id: string) => item.DELETE(jsonRequest("DELETE"), routeParams({ id }));
  const nuevo = async (over: Record<string, unknown> = {}) => (await (await crear(estandar(over))).json()) as Row;

  describe("crear", () => {
    it("un valor estándar para todos se guarda sin asignaciones, a nombre de quien lo crea", async () => {
      const res = await crear(estandar({ description: "Llegar a tiempo" }));
      expect(res.status).toBe(201);
      const [row] = await rows();
      expect(row).toMatchObject({
        tenantId: a.tenantId, name: "Puntualidad", amount: 50_000, valueType: "STANDARD",
        assignmentType: "ALL", frequency: "BIWEEKLY", monthlyMode: null, active: true,
        createdById: a.users.proprietario.id, assignments: [],
      });
      expect(await prisma.auditLog.count({ where: { action: "CREATE", module: modulo, entityId: row.id } })).toBe(1);
    });

    it("con valor por empleado, el monto general queda en 0 y cada asignación guarda el suyo", async () => {
      const res = await crear(estandar({
        valueType: "PER_EMPLOYEE", amount: 999, assignmentType: "SPECIFIC",
        assignments: [{ employeeId: a.ana.id, amount: 30_000 }, { employeeId: a.luis.id, amount: 45_000 }],
      }));
      expect(res.status).toBe(201);
      const [row] = await rows();
      expect(row.amount).toBe(0);
      expect(Object.fromEntries(row.assignments.map((x) => [x.employeeId, x.amount]))).toEqual({
        [a.ana.id]: 30_000, [a.luis.id]: 45_000,
      });
      expect(row.assignments.every((x) => x.tenantId === a.tenantId)).toBe(true);
    });

    it("una asignación específica con valor estándar guarda quiénes, sin monto propio", async () => {
      await crear(estandar({ assignmentType: "SPECIFIC", assignments: [{ employeeId: a.ana.id }] }));
      const [row] = await rows();
      expect(row.assignments).toHaveLength(1);
      expect(row.assignments[0]).toMatchObject({ employeeId: a.ana.id, amount: null });
    });

    it("el modo mensual solo se guarda cuando la frecuencia es mensual", async () => {
      await crear(estandar({ name: "Mensual", frequency: "MONTHLY", monthlyMode: "SPLIT" }));
      await crear(estandar({ name: "Quincenal", frequency: "BIWEEKLY", monthlyMode: "FIRST" }));
      const [mensual, quincenal] = await rows();
      expect(mensual.monthlyMode).toBe("SPLIT");
      expect(quincenal.monthlyMode).toBeNull();
    });

    it("[NEG] un empleado de otro tenant en las asignaciones responde 400 y no crea nada", async () => {
      const res = await crear(estandar({ assignmentType: "SPECIFIC", assignments: [{ employeeId: b.ana.id }] }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toMatch(/no pertenecen/);
      expect(await rows()).toHaveLength(0);
    });

    it.each([
      ["valor estándar en 0", { amount: 0 }],
      ["valor estándar sin monto", { amount: undefined }],
      ["mensual sin modo de pago", { frequency: "MONTHLY" }],
      ["específico sin empleados", { assignmentType: "SPECIFIC" }],
      ["por empleado sin asignaciones", { valueType: "PER_EMPLOYEE" }],
      ["por empleado con un monto en 0", { valueType: "PER_EMPLOYEE", assignments: [{ employeeId: "x", amount: 0 }] }],
      ["nombre de una letra", { name: "A" }],
      ["tipo de asignación desconocido", { assignmentType: "TODOS" }],
    ])("[NEG] %s responde 400", async (_caso, over) => {
      const res = await crear(estandar(over));
      expect(res.status).toBe(400);
      expect(await rows()).toHaveLength(0);
    });

    it("[CP-50] sin sesión 401; un empleado sin permiso 403; JSON roto 400", async () => {
      const roto = await list.POST(new Request("http://localhost/api", { method: "POST", body: "{" }));
      expect(roto.status).toBe(400);
      session = null;
      expect((await crear(estandar())).status).toBe(401);
      session = a.sessionOf("empleado");
      expect((await crear(estandar())).status).toBe(403);
      expect(await rows()).toHaveLength(0);
    });
  });

  describe("listar", () => {
    it("[RN-01] solo devuelve los del tenant de la sesión, con el nombre de cada empleado asignado", async () => {
      await nuevo({ assignmentType: "SPECIFIC", assignments: [{ employeeId: a.ana.id }] });
      session = b.sessionOf("proprietario");
      await nuevo({ name: "Del otro restaurante" });

      session = a.sessionOf("proprietario");
      const lista = await (await list.GET()).json();
      expect(lista).toHaveLength(1);
      expect(lista[0].name).toBe("Puntualidad");
      expect(lista[0].assignments[0].employee.name).toBe("Ana a");
    });

    it("[CP-50] sin sesión 401; sin permiso 403", async () => {
      session = null;
      expect((await list.GET()).status).toBe(401);
      session = a.sessionOf("empleado");
      expect((await list.GET()).status).toBe(403);
    });
  });

  describe("editar", () => {
    it("reemplaza por completo las asignaciones anteriores", async () => {
      const { id } = await nuevo({ assignmentType: "SPECIFIC", assignments: [{ employeeId: a.ana.id }] });
      const res = await editar(id, estandar({
        name: "Puntualidad plus", valueType: "PER_EMPLOYEE", assignmentType: "SPECIFIC",
        assignments: [{ employeeId: a.luis.id, amount: 20_000 }],
      }));
      expect(res.status).toBe(200);
      const [row] = await rows();
      expect(row).toMatchObject({ name: "Puntualidad plus", amount: 0, valueType: "PER_EMPLOYEE" });
      expect(row.assignments.map((x) => [x.employeeId, x.amount])).toEqual([[a.luis.id, 20_000]]);
    });

    it("pasar a «todos» con valor estándar deja el registro sin asignaciones", async () => {
      const { id } = await nuevo({ assignmentType: "SPECIFIC", assignments: [{ employeeId: a.ana.id }] });
      expect((await editar(id, estandar({ amount: 70_000 }))).status).toBe(200);
      const [row] = await rows();
      expect(row.amount).toBe(70_000);
      expect(row.assignments).toEqual([]);
    });

    it("editar sin enviar `active` conserva el estado que tenía", async () => {
      const { id } = await nuevo({ active: false });
      await editar(id, estandar({ name: "Renombrado" }));
      expect((await rows())[0]).toMatchObject({ name: "Renombrado", active: false });
    });

    it("[NEG] datos inválidos o un empleado ajeno responden 400 y no cambian nada", async () => {
      const { id } = await nuevo();
      expect((await editar(id, estandar({ amount: 0 }))).status).toBe(400);
      const ajeno = await editar(id, estandar({ assignmentType: "SPECIFIC", assignments: [{ employeeId: b.ana.id }] }));
      expect(ajeno.status).toBe(400);
      expect((await rows())[0]).toMatchObject({ amount: 50_000, assignmentType: "ALL" });
    });

    it("[RN-01] el registro de otro tenant responde 404 y no se toca", async () => {
      const { id } = await nuevo();
      session = b.sessionOf("proprietario");
      expect((await editar(id, estandar({ name: "Intruso" }))).status).toBe(404);
      expect((await activar(id, { active: false })).status).toBe(404);
      expect((await borrar(id)).status).toBe(404);
      expect((await rows())[0]).toMatchObject({ name: "Puntualidad", active: true });
    });

    it("[CP-50] sin sesión 401; sin permiso 403", async () => {
      const { id } = await nuevo();
      for (const llamada of [() => editar(id, estandar()), () => activar(id, { active: false }), () => borrar(id)]) {
        session = null;
        expect((await llamada()).status).toBe(401);
        session = a.sessionOf("empleado");
        expect((await llamada()).status).toBe(403);
      }
      expect(await rows()).toHaveLength(1);
    });
  });

  describe("activar, desactivar y eliminar", () => {
    it("PATCH cambia solo el estado y lo deja en auditoría como activación o desactivación", async () => {
      const { id } = await nuevo();
      expect((await activar(id, { active: false })).status).toBe(200);
      expect((await rows())[0].active).toBe(false);
      expect((await activar(id, { active: true })).status).toBe(200);
      expect((await rows())[0].active).toBe(true);

      const acciones = (await prisma.auditLog.findMany({ where: { entityId: id, module: modulo }, orderBy: { createdAt: "asc" } }))
        .map((l) => l.action);
      expect(acciones).toEqual(["CREATE", "DEACTIVATE", "ACTIVATE"]);
    });

    it("[NEG] PATCH sin un booleano responde 400", async () => {
      const { id } = await nuevo();
      expect((await activar(id, { active: "no" })).status).toBe(400);
      expect((await activar(id, {})).status).toBe(400);
    });

    it("DELETE borra el registro y sus asignaciones", async () => {
      const { id } = await nuevo({ assignmentType: "SPECIFIC", assignments: [{ employeeId: a.ana.id }] });
      expect((await borrar(id)).status).toBe(200);
      expect(await rows()).toHaveLength(0);
      expect(await prisma.bonusAssignment.count()).toBe(0);
      expect(await prisma.discountAssignment.count()).toBe(0);
      expect((await borrar(id)).status).toBe(404);
    });
  });
});
