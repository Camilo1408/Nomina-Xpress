import { prisma } from "@/lib/db";

/**
 * Límite de intentos de inicio de sesión (CP-45, hallazgo H3 del Plan de Calidad).
 *
 * Dos contadores por intento fallido:
 *   - usuario + IP: 5 fallos en 15 min bloquean a ese usuario desde esa IP;
 *   - solo usuario: 20 fallos en 15 min, desde cualquier IP, lo bloquean en todas.
 * El bloqueo es progresivo (15, 30 y 60 min como tope), se levanta solo y un
 * inicio de sesión correcto borra los contadores. Tras 24 h sin fallos se olvida.
 *
 * Los contadores viven en la base (tabla LoginThrottle) porque en Vercel cada
 * request puede caer en una instancia distinta: un contador en memoria no sirve.
 * Los usuarios inexistentes cuentan igual que los reales, para que el bloqueo no
 * revele qué usuarios existen.
 */
export const THROTTLE = {
  userIpLimit: 5,
  userLimit: 20,
  windowMs: 15 * 60_000,
  baseLockMs: 15 * 60_000,
  maxLockMs: 60 * 60_000,
  staleMs: 24 * 60 * 60_000,
} as const;

export type ThrottleRecord = {
  failures: number;
  windowStart: Date;
  lockedUntil: Date | null;
  lockCount: number;
  lastFailureAt: Date;
};

export interface ThrottleStore {
  get(key: string): Promise<ThrottleRecord | null>;
  set(key: string, rec: ThrottleRecord): Promise<void>;
  remove(keys: string[]): Promise<void>;
  /** Borra los registros cuyo último fallo es anterior a `before`. */
  purgeStale(before: Date): Promise<void>;
}

export type ThrottleKeys = { userIp: string; user: string };

const MAX_USERNAME_IN_KEY = 100;

export function throttleKeys(username: string, ip: string | null): ThrottleKeys {
  const u = username.trim().toLowerCase().slice(0, MAX_USERNAME_IN_KEY);
  return { userIp: `u:${u}|ip:${ip?.trim() || "?"}`, user: `u:${u}` };
}

/** Duración del bloqueo número `lockCount` (1 = primero): 15, 30, 60 min, tope 60. */
export function lockDurationMs(lockCount: number): number {
  const ms = THROTTLE.baseLockMs * 2 ** Math.max(0, lockCount - 1);
  return Math.min(ms, THROTTLE.maxLockMs);
}

/** Milisegundos que le quedan al bloqueo (0 = no está bloqueado). */
export function lockRemainingMs(rec: ThrottleRecord | null, now: Date): number {
  if (!rec?.lockedUntil) return 0;
  return Math.max(0, rec.lockedUntil.getTime() - now.getTime());
}

/** Registra un fallo y, si llega al límite, abre un bloqueo. Función pura. */
export function applyFailure(rec: ThrottleRecord | null, now: Date, limit: number): ThrottleRecord {
  const fresh: ThrottleRecord = {
    failures: 0, windowStart: now, lockedUntil: null, lockCount: 0, lastFailureAt: now,
  };
  let r: ThrottleRecord;
  if (!rec || now.getTime() - rec.lastFailureAt.getTime() >= THROTTLE.staleMs) {
    r = fresh;
  } else if (now.getTime() - rec.windowStart.getTime() >= THROTTLE.windowMs) {
    // Ventana vencida: los fallos empiezan de cero, el historial de bloqueos se conserva.
    r = { ...rec, failures: 0, windowStart: now, lockedUntil: null };
  } else {
    r = { ...rec };
  }
  r.failures += 1;
  r.lastFailureAt = now;
  if (r.failures >= limit) {
    r.lockCount += 1;
    r.lockedUntil = new Date(now.getTime() + lockDurationMs(r.lockCount));
    r.failures = 0;
    r.windowStart = now;
  }
  return r;
}

/** Milisegundos de bloqueo que le quedan a esta combinación (el mayor de los dos). */
export async function checkLock(store: ThrottleStore, keys: ThrottleKeys, now: Date): Promise<number> {
  const [userIp, user] = await Promise.all([store.get(keys.userIp), store.get(keys.user)]);
  return Math.max(lockRemainingMs(userIp, now), lockRemainingMs(user, now));
}

/**
 * Cuenta un fallo en los dos contadores. `lockedMs` > 0 si este fallo abrió un
 * bloqueo. Las escrituras no son atómicas: dos intentos simultáneos pueden contar
 * como uno, lo que a lo sumo deja pasar un par de intentos más. Es aceptable.
 */
export async function registerFailure(
  store: ThrottleStore,
  keys: ThrottleKeys,
  now: Date,
): Promise<{ lockedMs: number }> {
  await store.purgeStale(new Date(now.getTime() - THROTTLE.staleMs));
  const [prevUserIp, prevUser] = await Promise.all([store.get(keys.userIp), store.get(keys.user)]);
  const userIp = applyFailure(prevUserIp, now, THROTTLE.userIpLimit);
  const user = applyFailure(prevUser, now, THROTTLE.userLimit);
  await Promise.all([store.set(keys.userIp, userIp), store.set(keys.user, user)]);
  // applyFailure solo escribe un `lockedUntil` nuevo cuando abre un bloqueo.
  const opened = (prev: ThrottleRecord | null, next: ThrottleRecord) =>
    next.lockedUntil !== null && next.lockedUntil.getTime() !== prev?.lockedUntil?.getTime();
  const lockedMs = Math.max(
    opened(prevUserIp, userIp) ? lockRemainingMs(userIp, now) : 0,
    opened(prevUser, user) ? lockRemainingMs(user, now) : 0,
  );
  return { lockedMs };
}

export async function clearThrottle(store: ThrottleStore, keys: ThrottleKeys): Promise<void> {
  await store.remove([keys.userIp, keys.user]);
}

/** Almacén real: tabla LoginThrottle (ver prisma/turso-migrate-login-throttle.mjs). */
export const prismaThrottleStore: ThrottleStore = {
  async get(key) {
    const row = await prisma.loginThrottle.findUnique({ where: { key } });
    if (!row) return null;
    return {
      failures: row.failures,
      windowStart: row.windowStart,
      lockedUntil: row.lockedUntil,
      lockCount: row.lockCount,
      lastFailureAt: row.lastFailureAt,
    };
  },
  async set(key, rec) {
    await prisma.loginThrottle.upsert({ where: { key }, create: { key, ...rec }, update: rec });
  },
  async remove(keys) {
    await prisma.loginThrottle.deleteMany({ where: { key: { in: keys } } });
  },
  async purgeStale(before) {
    await prisma.loginThrottle.deleteMany({ where: { lastFailureAt: { lt: before } } });
  },
};

// ── Desbloqueo (PROPRIETARY/SUPERADMIN o al restablecer la contraseña) ─────────

/** Claves de contador de un usuario: la suya y las de cada IP desde la que falló. */
async function userThrottleKeys(username: string): Promise<string[]> {
  const { user } = throttleKeys(username, null);
  // `startsWith` va a un LIKE: "_" o "%" en el usuario actúan como comodines, así
  // que el filtro exacto se hace aquí para no tocar los contadores de otro usuario.
  const rows = await prisma.loginThrottle.findMany({
    where: { key: { startsWith: user } },
    select: { key: true },
  });
  return rows.map((r) => r.key).filter((k) => k === user || k.startsWith(`${user}|ip:`));
}

/** Borra todos los contadores (y bloqueos) del usuario. Devuelve cuántos borró. */
export async function unlockLogin(username: string): Promise<number> {
  const keys = await userThrottleKeys(username);
  if (keys.length === 0) return 0;
  const { count } = await prisma.loginThrottle.deleteMany({ where: { key: { in: keys } } });
  return count;
}

/**
 * Como `unlockLogin`, pero nunca lanza: se usa al cambiar una contraseña, donde
 * un fallo de esta tabla no debe impedir el cambio.
 */
export async function clearLoginLock(username: string): Promise<void> {
  try {
    await unlockLogin(username);
  } catch (err) {
    console.error("[login-throttle] no se pudieron borrar los contadores de", username, err);
  }
}

/** Usuarios (en minúsculas) con un bloqueo vigente, por usuario o desde alguna IP. */
export async function lockedUsernames(now: Date = new Date()): Promise<Set<string>> {
  const rows = await prisma.loginThrottle.findMany({
    where: { lockedUntil: { gt: now } },
    select: { key: true },
  });
  return new Set(rows.map((r) => r.key.slice(2).split("|ip:")[0]));
}

/** ¿Este usuario aparece en el conjunto que devuelve `lockedUsernames`? */
export function isUsernameLocked(locked: Set<string>, username: string): boolean {
  return locked.has(throttleKeys(username, null).user.slice(2));
}
