import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    bonus: { findMany: vi.fn() },
    discount: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { resolveBonusesForEmployees } from "../bonus-service";
import { resolveDiscountsForEmployees } from "../discount-service";

const tBonus = prisma.bonus.findMany as unknown as ReturnType<typeof vi.fn>;
const tDiscount = prisma.discount.findMany as unknown as ReturnType<typeof vi.fn>;

const EMP = [{ id: "e1", payType: "PAYROLL" }];

type BonusRow = {
  id: string;
  name: string;
  description: string | null;
  valueType: string;
  amount: number;
  assignmentType: string;
  frequency: string;
  monthlyMode: string | null;
  assignments: { employeeId: string; amount: number }[];
};

function bonusRow(over: Partial<BonusRow> = {}): BonusRow {
  return {
    id: "b1",
    name: "Auxilio de Transporte",
    description: null,
    valueType: "STANDARD",
    amount: 100_000,
    assignmentType: "PAYROLL",
    frequency: "BIWEEKLY",
    monthlyMode: null,
    assignments: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tBonus.mockResolvedValue([]);
  tDiscount.mockResolvedValue([]);
});

describe("resolveBonusesForEmployees — una quincena (comportamiento histórico intacto)", () => {
  it("bono quincenal en la primera quincena: valor completo, una sola aplicación", async () => {
    tBonus.mockResolvedValue([bonusRow()]);
    const map = await resolveBonusesForEmployees("t1", "2026-07-01", "2026-07-15", EMP);
    const r = map.get("e1")!;
    expect(r.totalBonuses).toBe(100_000);
    expect(r.bonuses[0].appliedAmount).toBe(100_000);
    expect(r.bonuses[0].periodsCount).toBe(1);
  });

  it("bono quincenal en la segunda quincena: mismo valor completo", async () => {
    tBonus.mockResolvedValue([bonusRow()]);
    const map = await resolveBonusesForEmployees("t1", "2026-07-16", "2026-07-31", EMP);
    expect(map.get("e1")!.totalBonuses).toBe(100_000);
  });

  it("bono MENSUAL modo FIRST no aparece en la segunda quincena", async () => {
    tBonus.mockResolvedValue([bonusRow({ frequency: "MONTHLY", monthlyMode: "FIRST" })]);
    const map = await resolveBonusesForEmployees("t1", "2026-07-16", "2026-07-31", EMP);
    expect(map.get("e1")!.bonuses).toEqual([]);
    expect(map.get("e1")!.totalBonuses).toBe(0);
  });

  it("bono MENSUAL modo SPLIT reparte mitad y mitad entre las dos quincenas", async () => {
    tBonus.mockResolvedValue([bonusRow({ frequency: "MONTHLY", monthlyMode: "SPLIT", amount: 100_001 })]);
    const first = await resolveBonusesForEmployees("t1", "2026-07-01", "2026-07-15", EMP);
    const second = await resolveBonusesForEmployees("t1", "2026-07-16", "2026-07-31", EMP);
    expect(first.get("e1")!.totalBonuses + second.get("e1")!.totalBonuses).toBe(100_001);
  });

  it("PER_EMPLOYEE sin asignación no aplica; con asignación usa el monto asignado", async () => {
    tBonus.mockResolvedValue([
      bonusRow({ valueType: "PER_EMPLOYEE", amount: 0, assignments: [] }),
    ]);
    expect((await resolveBonusesForEmployees("t1", "2026-07-01", "2026-07-15", EMP)).get("e1")!.totalBonuses).toBe(0);

    tBonus.mockResolvedValue([
      bonusRow({ valueType: "PER_EMPLOYEE", amount: 0, assignments: [{ employeeId: "e1", amount: 94_800 }] }),
    ]);
    expect((await resolveBonusesForEmployees("t1", "2026-07-01", "2026-07-15", EMP)).get("e1")!.totalBonuses).toBe(94_800);
  });

  it("un bono de SHIFT no se aplica a un empleado de nómina", async () => {
    tBonus.mockResolvedValue([bonusRow({ assignmentType: "SHIFT" })]);
    expect((await resolveBonusesForEmployees("t1", "2026-07-01", "2026-07-15", EMP)).get("e1")!.totalBonuses).toBe(0);
  });
});

describe("resolveBonusesForEmployees — rangos de varias quincenas", () => {
  it("un mes completo aplica el bono quincenal DOS veces", async () => {
    tBonus.mockResolvedValue([bonusRow()]);
    const r = (await resolveBonusesForEmployees("t1", "2026-07-01", "2026-07-31", EMP)).get("e1")!;
    expect(r.totalBonuses).toBe(200_000);
    expect(r.bonuses[0].periodsCount).toBe(2);
    // El valor configurado NO cambia: solo el aplicado acumula.
    expect(r.bonuses[0].configuredAmount).toBe(100_000);
  });

  it("dos meses aplican el bono quincenal CUATRO veces", async () => {
    tBonus.mockResolvedValue([bonusRow()]);
    const r = (await resolveBonusesForEmployees("t1", "2026-06-01", "2026-07-31", EMP)).get("e1")!;
    expect(r.totalBonuses).toBe(400_000);
    expect(r.bonuses[0].periodsCount).toBe(4);
  });

  it("un bono MENSUAL modo FIRST se aplica una vez por mes, no una por quincena", async () => {
    tBonus.mockResolvedValue([bonusRow({ frequency: "MONTHLY", monthlyMode: "FIRST" })]);
    const r = (await resolveBonusesForEmployees("t1", "2026-06-01", "2026-07-31", EMP)).get("e1")!;
    expect(r.totalBonuses).toBe(200_000); // junio + julio
    expect(r.bonuses[0].periodsCount).toBe(2);
  });

  it("un bono MENSUAL modo SPLIT suma el valor mensual completo en un mes completo", async () => {
    tBonus.mockResolvedValue([bonusRow({ frequency: "MONTHLY", monthlyMode: "SPLIT", amount: 100_001 })]);
    const r = (await resolveBonusesForEmployees("t1", "2026-07-01", "2026-07-31", EMP)).get("e1")!;
    expect(r.totalBonuses).toBe(100_001);
    expect(r.bonuses[0].periodsCount).toBe(2);
  });

  it("un rango corto dentro de una quincena sigue aplicando el bono UNA vez", async () => {
    tBonus.mockResolvedValue([bonusRow()]);
    const r = (await resolveBonusesForEmployees("t1", "2026-07-05", "2026-07-12", EMP)).get("e1")!;
    expect(r.totalBonuses).toBe(100_000);
    expect(r.bonuses[0].periodsCount).toBe(1);
  });
});

describe("resolveDiscountsForEmployees — mismas reglas que los bonos", () => {
  it("descuento quincenal en una quincena: una aplicación", async () => {
    tDiscount.mockResolvedValue([bonusRow({ id: "d1", name: "Pension", amount: 28_470 })]);
    const r = (await resolveDiscountsForEmployees("t1", "2026-07-01", "2026-07-15", EMP)).get("e1")!;
    expect(r.totalDiscounts).toBe(28_470);
    expect(r.discounts[0].periodsCount).toBe(1);
  });

  it("descuento quincenal en un mes completo: dos aplicaciones", async () => {
    tDiscount.mockResolvedValue([bonusRow({ id: "d1", name: "Pension", amount: 28_470 })]);
    const r = (await resolveDiscountsForEmployees("t1", "2026-07-01", "2026-07-31", EMP)).get("e1")!;
    expect(r.totalDiscounts).toBe(56_940);
    expect(r.discounts[0].periodsCount).toBe(2);
  });

  it("empleado sin descuentos configurados queda en 0", async () => {
    const r = (await resolveDiscountsForEmployees("t1", "2026-07-01", "2026-07-15", EMP)).get("e1")!;
    expect(r).toEqual({ discounts: [], totalDiscounts: 0 });
  });
});

describe("aislamiento por tenant", () => {
  it("bonos y descuentos se consultan siempre filtrando por tenantId y activos", async () => {
    await resolveBonusesForEmployees("tenant-x", "2026-07-01", "2026-07-15", EMP);
    await resolveDiscountsForEmployees("tenant-x", "2026-07-01", "2026-07-15", EMP);
    expect(tBonus).toHaveBeenCalledWith({
      where: { tenantId: "tenant-x", active: true },
      include: { assignments: { where: { active: true } } },
    });
    expect(tDiscount).toHaveBeenCalledWith({
      where: { tenantId: "tenant-x", active: true },
      include: { assignments: { where: { active: true } } },
    });
  });

  it("con lista de empleados vacía no consulta la BD", async () => {
    await resolveBonusesForEmployees("t1", "2026-07-01", "2026-07-15", []);
    await resolveDiscountsForEmployees("t1", "2026-07-01", "2026-07-15", []);
    expect(tBonus).not.toHaveBeenCalled();
    expect(tDiscount).not.toHaveBeenCalled();
  });
});
