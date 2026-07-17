import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock del cliente Prisma antes de importar el helper.
vi.mock("@/lib/db", () => ({
  prisma: {
    timeEntry: { findMany: vi.fn() },
    payAdjustment: { findMany: vi.fn() },
    tipDistribution: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { fetchPayrollPeriodData } from "../payroll-report";

const tEntry = prisma.timeEntry.findMany as unknown as ReturnType<typeof vi.fn>;
const tAdj = prisma.payAdjustment.findMany as unknown as ReturnType<typeof vi.fn>;
const tTip = prisma.tipDistribution.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  tEntry.mockResolvedValue([]);
  tAdj.mockResolvedValue([]);
  tTip.mockResolvedValue([]);
});

describe("fetchPayrollPeriodData", () => {
  it("con lista de empleados vacía devuelve mapa vacío y NO consulta la BD", async () => {
    const map = await fetchPayrollPeriodData("t1", "2026-07-01", "2026-07-15", []);
    expect(map.size).toBe(0);
    expect(tEntry).not.toHaveBeenCalled();
    expect(tAdj).not.toHaveBeenCalled();
    expect(tTip).not.toHaveBeenCalled();
  });

  it("hace exactamente 3 consultas (no N+1) sin importar cuántos empleados", async () => {
    await fetchPayrollPeriodData("t1", "2026-07-01", "2026-07-15", ["e1", "e2", "e3"]);
    expect(tEntry).toHaveBeenCalledTimes(1);
    expect(tAdj).toHaveBeenCalledTimes(1);
    expect(tTip).toHaveBeenCalledTimes(1);
  });

  it("filtra por employeeId IN, tenant y rango de fechas", async () => {
    await fetchPayrollPeriodData("t1", "2026-07-01", "2026-07-15", ["e1", "e2"]);
    expect(tEntry).toHaveBeenCalledWith({
      where: { tenantId: "t1", employeeId: { in: ["e1", "e2"] }, date: { gte: "2026-07-01", lte: "2026-07-15" } },
    });
    expect(tAdj).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        employeeId: { in: ["e1", "e2"] },
        periodStart: { gte: "2026-07-01" },
        periodEnd: { lte: "2026-07-15" },
      },
    });
    expect(tTip).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        employeeId: { in: ["e1", "e2"] },
        tipEntry: { date: { gte: "2026-07-01", lte: "2026-07-15" } },
      },
      include: { tipEntry: { select: { date: true } } },
    });
  });

  it("agrupa por employeeId y preserva el orden relativo de cada empleado", async () => {
    // Orden global mezclado entre empleados (como devolvería una query masiva por rowid).
    tEntry.mockResolvedValue([
      { id: "a", employeeId: "e1" },
      { id: "b", employeeId: "e2" },
      { id: "c", employeeId: "e1" },
      { id: "d", employeeId: "e1" },
    ]);
    tAdj.mockResolvedValue([{ id: "adj1", employeeId: "e2" }]);
    tTip.mockResolvedValue([
      { id: "t1", employeeId: "e1", amount: 100, tipEntry: { date: "2026-07-03" } },
    ]);

    const map = await fetchPayrollPeriodData("t1", "2026-07-01", "2026-07-15", ["e1", "e2"]);

    // e1 conserva el orden relativo a, c, d (filtrado del orden global)
    expect(map.get("e1")!.entries.map((e) => e.id)).toEqual(["a", "c", "d"]);
    expect(map.get("e2")!.entries.map((e) => e.id)).toEqual(["b"]);
    expect(map.get("e2")!.adjustments.map((a) => a.id)).toEqual(["adj1"]);
    expect(map.get("e1")!.adjustments).toEqual([]);
    expect(map.get("e1")!.tipDists[0].tipEntry.date).toBe("2026-07-03");
    expect(map.get("e2")!.tipDists).toEqual([]);
  });

  it("incluye a un empleado sin datos con buckets vacíos", async () => {
    tEntry.mockResolvedValue([{ id: "a", employeeId: "e1" }]);
    const map = await fetchPayrollPeriodData("t1", "2026-07-01", "2026-07-15", ["e1", "e2"]);
    expect(map.has("e2")).toBe(true);
    expect(map.get("e2")).toEqual({ entries: [], adjustments: [], tipDists: [] });
  });

  it("ignora filas de empleados que no están en la lista pedida (defensivo)", async () => {
    tEntry.mockResolvedValue([
      { id: "a", employeeId: "e1" },
      { id: "x", employeeId: "eX" }, // no solicitado
    ]);
    const map = await fetchPayrollPeriodData("t1", "2026-07-01", "2026-07-15", ["e1"]);
    expect(map.has("eX")).toBe(false);
    expect(map.get("e1")!.entries.map((e) => e.id)).toEqual(["a"]);
  });
});
