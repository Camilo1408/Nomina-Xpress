// CP-45 (H3): límite de intentos de inicio de sesión con bloqueo progresivo.
// Lógica pura: no toca la base; el almacén se simula en memoria.

import { describe, it, expect } from "vitest";
import {
  THROTTLE,
  applyFailure,
  lockRemainingMs,
  lockDurationMs,
  throttleKeys,
  checkLock,
  registerFailure,
  clearThrottle,
  type ThrottleRecord,
  type ThrottleStore,
} from "@/lib/login-throttle";

const MIN = 60_000;
const T0 = new Date("2026-11-06T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

function memoryStore(): ThrottleStore & { rows: Map<string, ThrottleRecord> } {
  const rows = new Map<string, ThrottleRecord>();
  return {
    rows,
    async get(key) { return rows.get(key) ?? null; },
    async set(key, rec) { rows.set(key, { ...rec }); },
    async remove(keys) { for (const k of keys) rows.delete(k); },
    async purgeStale(before) {
      for (const [k, r] of rows) if (r.lastFailureAt < before) rows.delete(k);
    },
  };
}

function failTimes(n: number, limit: number, start: ThrottleRecord | null = null, now = T0) {
  let rec = start;
  for (let i = 0; i < n; i++) rec = applyFailure(rec, now, limit);
  return rec!;
}

describe("throttleKeys", () => {
  it("[CP-45] genera una clave por usuario+IP y otra solo por usuario, sin distinguir mayúsculas", () => {
    expect(throttleKeys("  Admin ", "1.2.3.4")).toEqual({
      userIp: "u:admin|ip:1.2.3.4",
      user: "u:admin",
    });
  });

  it("[CP-45] sin IP usa un marcador fijo y recorta usuarios muy largos", () => {
    const keys = throttleKeys("x".repeat(500), null);
    expect(keys.userIp.endsWith("|ip:?")).toBe(true);
    expect(keys.user.length).toBeLessThanOrEqual(2 + 100);
  });
});

describe("applyFailure / lockRemainingMs", () => {
  it(`[CP-45] bloquea al llegar al límite (${THROTTLE.userIpLimit} fallos) durante 15 min`, () => {
    const four = failTimes(THROTTLE.userIpLimit - 1, THROTTLE.userIpLimit);
    expect(lockRemainingMs(four, T0)).toBe(0);
    const five = applyFailure(four, T0, THROTTLE.userIpLimit);
    expect(lockRemainingMs(five, T0)).toBe(15 * MIN);
    expect(five.lockCount).toBe(1);
  });

  it("[CP-45] el bloqueo se levanta solo al vencer el tiempo", () => {
    const locked = failTimes(THROTTLE.userIpLimit, THROTTLE.userIpLimit);
    expect(lockRemainingMs(locked, at(15 * MIN - 1))).toBe(1);
    expect(lockRemainingMs(locked, at(15 * MIN))).toBe(0);
  });

  it("[CP-45] el bloqueo es progresivo: 15, 30 y luego 60 min como tope", () => {
    expect(lockDurationMs(1)).toBe(15 * MIN);
    expect(lockDurationMs(2)).toBe(30 * MIN);
    expect(lockDurationMs(3)).toBe(60 * MIN);
    expect(lockDurationMs(9)).toBe(60 * MIN);

    const first = failTimes(5, 5);
    const second = failTimes(5, 5, first, at(16 * MIN));
    expect(second.lockCount).toBe(2);
    expect(lockRemainingMs(second, at(16 * MIN))).toBe(30 * MIN);
  });

  it("[CP-45] [LIM] los fallos fuera de la ventana de 15 min no se acumulan", () => {
    const four = failTimes(4, 5);
    const later = applyFailure(four, at(15 * MIN), 5);
    expect(later.failures).toBe(1);
    expect(lockRemainingMs(later, at(15 * MIN))).toBe(0);
  });

  it("[CP-45] tras 24 h sin fallos se olvida el historial de bloqueos", () => {
    const locked = failTimes(5, 5);
    const nextDay = failTimes(5, 5, locked, at(25 * 60 * MIN));
    expect(nextDay.lockCount).toBe(1);
    expect(lockRemainingMs(nextDay, at(25 * 60 * MIN))).toBe(15 * MIN);
  });
});

describe("checkLock / registerFailure / clearThrottle", () => {
  it(`[CP-45] ${THROTTLE.userIpLimit} fallos desde la misma IP bloquean a ese usuario en esa IP`, async () => {
    const store = memoryStore();
    const keys = throttleKeys("admin", "1.1.1.1");
    for (let i = 0; i < THROTTLE.userIpLimit - 1; i++) {
      expect((await registerFailure(store, keys, T0)).lockedMs).toBe(0);
    }
    expect((await registerFailure(store, keys, T0)).lockedMs).toBe(15 * MIN);
    expect(await checkLock(store, keys, T0)).toBe(15 * MIN);
    // Otra IP no queda bloqueada por esos 5 fallos.
    expect(await checkLock(store, throttleKeys("admin", "2.2.2.2"), T0)).toBe(0);
  });

  it(`[CP-45] ${THROTTLE.userLimit} fallos desde IPs distintas bloquean al usuario en todas`, async () => {
    const store = memoryStore();
    let last = 0;
    for (let i = 0; i < THROTTLE.userLimit; i++) {
      last = (await registerFailure(store, throttleKeys("admin", `10.0.0.${i}`), T0)).lockedMs;
    }
    expect(last).toBe(15 * MIN);
    expect(await checkLock(store, throttleKeys("admin", "9.9.9.9"), T0)).toBe(15 * MIN);
  });

  it("[CP-45] un inicio de sesión correcto borra los contadores", async () => {
    const store = memoryStore();
    const keys = throttleKeys("admin", "1.1.1.1");
    for (let i = 0; i < 3; i++) await registerFailure(store, keys, T0);
    await clearThrottle(store, keys);
    expect(store.rows.size).toBe(0);
  });

  it("[CP-45] cada fallo purga los registros con más de 24 h sin actividad", async () => {
    const store = memoryStore();
    await registerFailure(store, throttleKeys("viejo", "1.1.1.1"), T0);
    await registerFailure(store, throttleKeys("nuevo", "1.1.1.1"), at(25 * 60 * MIN));
    expect([...store.rows.keys()].some((k) => k.includes("viejo"))).toBe(false);
  });
});
