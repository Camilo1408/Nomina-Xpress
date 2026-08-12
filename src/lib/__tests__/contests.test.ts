import { describe, it, expect } from "vitest";
import {
  TIP_MENAJE_PERCENT,
  TIP_CONTEST_MAX_PERCENT,
  TIP_DEDUCTION_MAX_PERCENT,
  contestAppliesToDate,
  canTransition,
  isContestConfigEditable,
  validateItemPercent,
  validateTotalContestPercent,
  splitPrizeAmong,
  nextBiweeklyPeriodAfter,
  computeInstallments,
  qualifiesForGoal,
  resolveWinners,
  formatGoalSnapshot,
  eachDateInRange,
} from "../contests";

// ─── Iteración de fechas del rango ───────────────────────────────────────────

describe("eachDateInRange", () => {
  it("incluye los dos extremos", () => {
    expect(eachDateInRange("2026-08-01", "2026-08-03")).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("un rango de un solo día devuelve ese día", () => {
    expect(eachDateInRange("2026-08-05", "2026-08-05")).toEqual(["2026-08-05"]);
  });

  it("cruza el cambio de mes", () => {
    expect(eachDateInRange("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
  });

  it("cruza el cambio de año", () => {
    expect(eachDateInRange("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("cuenta bien febrero bisiesto", () => {
    expect(eachDateInRange("2028-02-27", "2028-03-01")).toEqual([
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("un rango invertido devuelve lista vacía", () => {
    expect(eachDateInRange("2026-08-10", "2026-08-01")).toEqual([]);
  });

  it("rechaza rangos absurdamente largos en vez de colgarse", () => {
    expect(() => eachDateInRange("2020-01-01", "2030-01-01")).toThrow(/rango/i);
  });

  it("un año completo cabe sin problema", () => {
    expect(eachDateInRange("2026-01-01", "2026-12-31")).toHaveLength(365);
  });
});

// ─── Constantes ──────────────────────────────────────────────────────────────

describe("topes de descuento", () => {
  it("el menaje es el 10% y coincide con MENAJE_PERCENT de tips.ts", () => {
    expect(TIP_MENAJE_PERCENT).toBe(10);
  });

  it("los concursos pueden acumular hasta 20% y el total no pasa de 30%", () => {
    expect(TIP_CONTEST_MAX_PERCENT).toBe(20);
    expect(TIP_DEDUCTION_MAX_PERCENT).toBe(30);
    expect(TIP_MENAJE_PERCENT + TIP_CONTEST_MAX_PERCENT).toBe(TIP_DEDUCTION_MAX_PERCENT);
  });
});

// ─── Aplicabilidad de un concurso a un día ───────────────────────────────────

describe("contestAppliesToDate", () => {
  it("aplica cuando está ACTIVO y la fecha cae dentro del rango", () => {
    expect(contestAppliesToDate("ACTIVO", "2026-08-01", "2026-08-31", "2026-08-15")).toBe(true);
  });

  it("incluye los dos extremos del rango", () => {
    expect(contestAppliesToDate("ACTIVO", "2026-08-01", "2026-08-31", "2026-08-01")).toBe(true);
    expect(contestAppliesToDate("ACTIVO", "2026-08-01", "2026-08-31", "2026-08-31")).toBe(true);
  });

  it("no aplica un día antes ni un día después del rango", () => {
    expect(contestAppliesToDate("ACTIVO", "2026-08-01", "2026-08-31", "2026-07-31")).toBe(false);
    expect(contestAppliesToDate("ACTIVO", "2026-08-01", "2026-08-31", "2026-09-01")).toBe(false);
  });

  it("SOLO el estado ACTIVO genera reservas", () => {
    for (const status of ["BORRADOR", "PROGRAMADO", "FINALIZADO", "PAGADO", "CANCELADO"] as const) {
      expect(contestAppliesToDate(status, "2026-08-01", "2026-08-31", "2026-08-15")).toBe(false);
    }
  });

  it("compara fechas como texto: funciona en cruce de mes y de año", () => {
    expect(contestAppliesToDate("ACTIVO", "2026-12-20", "2027-01-10", "2026-12-31")).toBe(true);
    expect(contestAppliesToDate("ACTIVO", "2026-12-20", "2027-01-10", "2027-01-01")).toBe(true);
    expect(contestAppliesToDate("ACTIVO", "2026-12-20", "2027-01-10", "2027-01-11")).toBe(false);
  });
});

// ─── Transiciones de estado ──────────────────────────────────────────────────

describe("canTransition", () => {
  it("permite el camino feliz completo", () => {
    expect(canTransition("BORRADOR", "PROGRAMADO")).toBe(true);
    expect(canTransition("PROGRAMADO", "ACTIVO")).toBe(true);
    expect(canTransition("ACTIVO", "FINALIZADO")).toBe(true);
    expect(canTransition("FINALIZADO", "PAGADO")).toBe(true);
  });

  it("permite cancelar desde los cuatro estados vivos", () => {
    for (const from of ["BORRADOR", "PROGRAMADO", "ACTIVO", "FINALIZADO"] as const) {
      expect(canTransition(from, "CANCELADO")).toBe(true);
    }
  });

  it("no permite salir de PAGADO ni de CANCELADO", () => {
    expect(canTransition("PAGADO", "ACTIVO")).toBe(false);
    expect(canTransition("PAGADO", "CANCELADO")).toBe(false);
    expect(canTransition("CANCELADO", "ACTIVO")).toBe(false);
    expect(canTransition("CANCELADO", "BORRADOR")).toBe(false);
  });

  it("no permite saltarse estados ni retroceder", () => {
    expect(canTransition("BORRADOR", "ACTIVO")).toBe(false);
    expect(canTransition("BORRADOR", "FINALIZADO")).toBe(false);
    expect(canTransition("ACTIVO", "PROGRAMADO")).toBe(false);
    expect(canTransition("FINALIZADO", "ACTIVO")).toBe(false);
  });
});

describe("isContestConfigEditable", () => {
  it("la configuración se edita mientras el concurso está vivo y sin congelar", () => {
    expect(isContestConfigEditable("BORRADOR")).toBe(true);
    expect(isContestConfigEditable("PROGRAMADO")).toBe(true);
    expect(isContestConfigEditable("ACTIVO")).toBe(true);
  });

  it("la configuración queda congelada al finalizar, pagar o cancelar", () => {
    expect(isContestConfigEditable("FINALIZADO")).toBe(false);
    expect(isContestConfigEditable("PAGADO")).toBe(false);
    expect(isContestConfigEditable("CANCELADO")).toBe(false);
  });
});

// ─── Validación de porcentajes ───────────────────────────────────────────────

describe("validateItemPercent", () => {
  it("acepta porcentajes normales", () => {
    expect(validateItemPercent(2)).toEqual({ ok: true });
    expect(validateItemPercent(0.5)).toEqual({ ok: true });
    expect(validateItemPercent(20)).toEqual({ ok: true });
  });

  it("rechaza cero y negativos", () => {
    expect(validateItemPercent(0).ok).toBe(false);
    expect(validateItemPercent(-1).ok).toBe(false);
  });

  it("rechaza por encima del tope de concursos", () => {
    expect(validateItemPercent(20.01).ok).toBe(false);
    expect(validateItemPercent(25).ok).toBe(false);
  });

  it("rechaza más de dos decimales", () => {
    expect(validateItemPercent(1.234).ok).toBe(false);
    expect(validateItemPercent(1.23).ok).toBe(true);
  });

  it("rechaza valores no finitos", () => {
    expect(validateItemPercent(NaN).ok).toBe(false);
    expect(validateItemPercent(Infinity).ok).toBe(false);
  });
});

describe("validateTotalContestPercent", () => {
  it("acepta justo el tope", () => {
    expect(validateTotalContestPercent(20).ok).toBe(true);
  });

  it("rechaza un céntimo por encima del tope", () => {
    expect(validateTotalContestPercent(20.01).ok).toBe(false);
  });

  it("acumula varios porcentajes del mismo día", () => {
    expect(validateTotalContestPercent(2 + 1 + 1).ok).toBe(true);
    expect(validateTotalContestPercent(10 + 8 + 3).ok).toBe(false);
  });

  it("tolera el error de coma flotante al sumar decimales", () => {
    // 0.1 + 0.2 = 0.30000000000000004 en punto flotante
    expect(validateTotalContestPercent(19.9 + 0.1).ok).toBe(true);
  });
});

// ─── Reparto del premio entre varios ganadores ───────────────────────────────

describe("splitPrizeAmong", () => {
  it("un solo ganador se lleva todo", () => {
    expect(splitPrizeAmong(400000, 1)).toEqual([400000]);
  });

  it("reparte en partes iguales cuando divide exacto", () => {
    expect(splitPrizeAmong(400000, 2)).toEqual([200000, 200000]);
  });

  it("el residuo va al primero para que la suma sea exacta", () => {
    expect(splitPrizeAmong(100000, 3)).toEqual([33334, 33333, 33333]);
  });

  it("la suma de las partes SIEMPRE es igual a la base", () => {
    for (const base of [0, 1, 7, 99, 100000, 400001, 1234567]) {
      for (const n of [1, 2, 3, 5, 7, 11]) {
        const parts = splitPrizeAmong(base, n);
        expect(parts).toHaveLength(n);
        expect(parts.reduce((s, p) => s + p, 0)).toBe(base);
      }
    }
  });

  it("con base cero reparte ceros", () => {
    expect(splitPrizeAmong(0, 3)).toEqual([0, 0, 0]);
  });

  it("sin ganadores devuelve lista vacía", () => {
    expect(splitPrizeAmong(1000, 0)).toEqual([]);
  });

  it("reparte más que la base cuando hay más ganadores que pesos", () => {
    expect(splitPrizeAmong(2, 5)).toEqual([2, 0, 0, 0, 0]);
  });
});

// ─── Quincena destino del pago ───────────────────────────────────────────────

describe("nextBiweeklyPeriodAfter", () => {
  it("de la primera quincena pasa a la segunda del mismo mes", () => {
    expect(nextBiweeklyPeriodAfter("2026-08-10")).toEqual({
      periodStart: "2026-08-16",
      periodEnd: "2026-08-31",
    });
  });

  it("de la segunda quincena pasa a la primera del mes siguiente", () => {
    expect(nextBiweeklyPeriodAfter("2026-08-20")).toEqual({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-15",
    });
  });

  it("cruza el año correctamente", () => {
    expect(nextBiweeklyPeriodAfter("2026-12-20")).toEqual({
      periodStart: "2027-01-01",
      periodEnd: "2027-01-15",
    });
  });

  it("respeta los meses de 30 días", () => {
    expect(nextBiweeklyPeriodAfter("2026-04-05")).toEqual({
      periodStart: "2026-04-16",
      periodEnd: "2026-04-30",
    });
  });

  it("respeta febrero no bisiesto", () => {
    expect(nextBiweeklyPeriodAfter("2026-02-01")).toEqual({
      periodStart: "2026-02-16",
      periodEnd: "2026-02-28",
    });
  });

  it("respeta febrero bisiesto", () => {
    expect(nextBiweeklyPeriodAfter("2028-02-01")).toEqual({
      periodStart: "2028-02-16",
      periodEnd: "2028-02-29",
    });
  });

  it("funciona desde el último día del mes", () => {
    expect(nextBiweeklyPeriodAfter("2026-08-31")).toEqual({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-15",
    });
  });

  it("funciona desde el día 15 y desde el 16 (borde de quincena)", () => {
    expect(nextBiweeklyPeriodAfter("2026-08-15")).toEqual({
      periodStart: "2026-08-16",
      periodEnd: "2026-08-31",
    });
    expect(nextBiweeklyPeriodAfter("2026-08-16")).toEqual({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-15",
    });
  });
});

describe("computeInstallments", () => {
  it("pago UNICO genera una sola cuota en la quincena siguiente", () => {
    expect(computeInstallments(400000, "UNICO", "2026-08-15")).toEqual([
      { installment: 1, periodStart: "2026-08-16", periodEnd: "2026-08-31", amount: 400000 },
    ]);
  });

  it("pago DIVIDIDO genera dos cuotas en las dos quincenas siguientes", () => {
    expect(computeInstallments(400000, "DIVIDIDO", "2026-08-15")).toEqual([
      { installment: 1, periodStart: "2026-08-16", periodEnd: "2026-08-31", amount: 200000 },
      { installment: 2, periodStart: "2026-09-01", periodEnd: "2026-09-15", amount: 200000 },
    ]);
  });

  it("con monto impar las dos cuotas suman exactamente el total", () => {
    const cuotas = computeInstallments(400001, "DIVIDIDO", "2026-08-15");
    expect(cuotas[0].amount + cuotas[1].amount).toBe(400001);
  });

  it("la suma de cuotas SIEMPRE es igual al total", () => {
    for (const total of [1, 3, 999, 400001, 1234567]) {
      for (const mode of ["UNICO", "DIVIDIDO"] as const) {
        const cuotas = computeInstallments(total, mode, "2026-08-15");
        expect(cuotas.reduce((s, c) => s + c.amount, 0)).toBe(total);
      }
    }
  });

  it("un concurso que termina en la segunda quincena paga en el mes siguiente", () => {
    expect(computeInstallments(100000, "DIVIDIDO", "2026-08-31")).toEqual([
      { installment: 1, periodStart: "2026-09-01", periodEnd: "2026-09-15", amount: 50000 },
      { installment: 2, periodStart: "2026-09-16", periodEnd: "2026-09-30", amount: 50000 },
    ]);
  });

  it("con total cero no genera cuotas", () => {
    expect(computeInstallments(0, "UNICO", "2026-08-15")).toEqual([]);
  });
});

// ─── Cumplimiento de la meta ─────────────────────────────────────────────────

describe("qualifiesForGoal", () => {
  it("MAYOR_VALOR exige alcanzar o superar la meta", () => {
    expect(qualifiesForGoal(240, 240, "MAYOR_VALOR")).toBe(true);
    expect(qualifiesForGoal(241, 240, "MAYOR_VALOR")).toBe(true);
    expect(qualifiesForGoal(239, 240, "MAYOR_VALOR")).toBe(false);
  });

  it("MENOR_VALOR exige quedar en o por debajo de la meta", () => {
    expect(qualifiesForGoal(10, 10, "MENOR_VALOR")).toBe(true);
    expect(qualifiesForGoal(9, 10, "MENOR_VALOR")).toBe(true);
    expect(qualifiesForGoal(11, 10, "MENOR_VALOR")).toBe(false);
  });

  it("PRIMERO_EN_ALCANZAR y SELECCION_MANUAL usan el umbral de MAYOR_VALOR", () => {
    expect(qualifiesForGoal(240, 240, "PRIMERO_EN_ALCANZAR")).toBe(true);
    expect(qualifiesForGoal(239, 240, "PRIMERO_EN_ALCANZAR")).toBe(false);
    expect(qualifiesForGoal(240, 240, "SELECCION_MANUAL")).toBe(true);
    expect(qualifiesForGoal(239, 240, "SELECCION_MANUAL")).toBe(false);
  });
});

// ─── Resolución del ganador ──────────────────────────────────────────────────

const r = (employeeId: string, value: number, achievedAt: Date | null = null) => ({
  employeeId,
  value,
  achievedAt,
});

describe("resolveWinners", () => {
  it("MAYOR_VALOR con GANADOR_UNICO elige al de resultado más alto", () => {
    const res = resolveWinners({
      criteria: "MAYOR_VALOR",
      goalValue: 200,
      winnerMode: "GANADOR_UNICO",
      results: [r("a", 240), r("b", 300), r("c", 210)],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.winners.map((w) => w.employeeId)).toEqual(["b"]);
  });

  it("MENOR_VALOR con GANADOR_UNICO elige al de resultado más bajo", () => {
    const res = resolveWinners({
      criteria: "MENOR_VALOR",
      goalValue: 100,
      winnerMode: "GANADOR_UNICO",
      results: [r("a", 80), r("b", 50), r("c", 95)],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.winners.map((w) => w.employeeId)).toEqual(["b"]);
  });

  it("descarta a quienes no alcanzan la meta", () => {
    const res = resolveWinners({
      criteria: "MAYOR_VALOR",
      goalValue: 250,
      winnerMode: "GANADOR_UNICO",
      results: [r("a", 240), r("b", 300), r("c", 210)],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.winners.map((w) => w.employeeId)).toEqual(["b"]);
  });

  it("si nadie alcanza la meta el ítem queda desierto", () => {
    const res = resolveWinners({
      criteria: "MAYOR_VALOR",
      goalValue: 500,
      winnerMode: "GANADOR_UNICO",
      results: [r("a", 240), r("b", 300)],
    });
    expect(res).toEqual({ ok: false, reason: "SIN_CALIFICADOS", candidates: [] });
  });

  it("sin resultados registrados el ítem queda desierto", () => {
    const res = resolveWinners({
      criteria: "MAYOR_VALOR",
      goalValue: 100,
      winnerMode: "GANADOR_UNICO",
      results: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("SIN_CALIFICADOS");
  });

  it("REPARTIDO premia a TODOS los que alcanzan la meta", () => {
    const res = resolveWinners({
      criteria: "MAYOR_VALOR",
      goalValue: 200,
      winnerMode: "REPARTIDO",
      results: [r("a", 240), r("b", 300), r("c", 150)],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.winners.map((w) => w.employeeId).sort()).toEqual(["a", "b"]);
  });

  it("un empate en GANADOR_UNICO no lo resuelve el sistema", () => {
    const res = resolveWinners({
      criteria: "MAYOR_VALOR",
      goalValue: 200,
      winnerMode: "GANADOR_UNICO",
      results: [r("a", 300), r("b", 300), r("c", 210)],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("EMPATE");
      expect(res.candidates.map((c) => c.employeeId).sort()).toEqual(["a", "b"]);
    }
  });

  it("PRIMERO_EN_ALCANZAR gana quien llegó antes, no quien tiene más", () => {
    const res = resolveWinners({
      criteria: "PRIMERO_EN_ALCANZAR",
      goalValue: 200,
      winnerMode: "GANADOR_UNICO",
      results: [
        r("a", 500, new Date("2026-08-20T10:00:00Z")),
        r("b", 210, new Date("2026-08-18T10:00:00Z")),
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.winners.map((w) => w.employeeId)).toEqual(["b"]);
  });

  it("PRIMERO_EN_ALCANZAR descarta a quien no tiene fecha de logro", () => {
    const res = resolveWinners({
      criteria: "PRIMERO_EN_ALCANZAR",
      goalValue: 200,
      winnerMode: "GANADOR_UNICO",
      results: [r("a", 500, null), r("b", 210, new Date("2026-08-18T10:00:00Z"))],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.winners.map((w) => w.employeeId)).toEqual(["b"]);
  });

  it("SELECCION_MANUAL sin selección pide elegir entre los calificados", () => {
    const res = resolveWinners({
      criteria: "SELECCION_MANUAL",
      goalValue: 200,
      winnerMode: "GANADOR_UNICO",
      results: [r("a", 240), r("b", 300)],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("SELECCION_REQUERIDA");
      expect(res.candidates.map((c) => c.employeeId).sort()).toEqual(["a", "b"]);
    }
  });

  it("SELECCION_MANUAL respeta al elegido", () => {
    const res = resolveWinners({
      criteria: "SELECCION_MANUAL",
      goalValue: 200,
      winnerMode: "GANADOR_UNICO",
      results: [r("a", 240), r("b", 300)],
      manualEmployeeIds: ["a"],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.winners.map((w) => w.employeeId)).toEqual(["a"]);
  });

  it("SELECCION_MANUAL rechaza elegir a quien no alcanzó la meta", () => {
    const res = resolveWinners({
      criteria: "SELECCION_MANUAL",
      goalValue: 200,
      winnerMode: "GANADOR_UNICO",
      results: [r("a", 240), r("b", 100)],
      manualEmployeeIds: ["b"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("SELECCION_INVALIDA");
  });

  it("SELECCION_MANUAL con GANADOR_UNICO rechaza elegir a dos", () => {
    const res = resolveWinners({
      criteria: "SELECCION_MANUAL",
      goalValue: 200,
      winnerMode: "GANADOR_UNICO",
      results: [r("a", 240), r("b", 300)],
      manualEmployeeIds: ["a", "b"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("SELECCION_INVALIDA");
  });

  it("SELECCION_MANUAL con REPARTIDO acepta varios elegidos", () => {
    const res = resolveWinners({
      criteria: "SELECCION_MANUAL",
      goalValue: 200,
      winnerMode: "REPARTIDO",
      results: [r("a", 240), r("b", 300), r("c", 250)],
      manualEmployeeIds: ["a", "c"],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.winners.map((w) => w.employeeId).sort()).toEqual(["a", "c"]);
  });

  it("una selección manual con un empleado inexistente es inválida", () => {
    const res = resolveWinners({
      criteria: "SELECCION_MANUAL",
      goalValue: 200,
      winnerMode: "REPARTIDO",
      results: [r("a", 240)],
      manualEmployeeIds: ["a", "zzz"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("SELECCION_INVALIDA");
  });

  it("una selección manual vacía pide elegir", () => {
    const res = resolveWinners({
      criteria: "SELECCION_MANUAL",
      goalValue: 200,
      winnerMode: "REPARTIDO",
      results: [r("a", 240)],
      manualEmployeeIds: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("SELECCION_REQUERIDA");
  });
});

// ─── Snapshot legible de la meta ─────────────────────────────────────────────

describe("formatGoalSnapshot", () => {
  it("junta valor y unidad", () => {
    expect(formatGoalSnapshot(240, "unidades")).toBe("240 unidades");
  });

  it("no arrastra decimales innecesarios", () => {
    expect(formatGoalSnapshot(1500000, "COP")).toBe("1500000 COP");
    expect(formatGoalSnapshot(2.5, "litros")).toBe("2.5 litros");
  });
});
