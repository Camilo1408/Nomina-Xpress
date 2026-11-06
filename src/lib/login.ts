import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { CredentialsSignin } from "next-auth";
import { prisma } from "@/lib/db";
import { recordAudit, getClientInfo } from "@/lib/audit";
import {
  checkLock,
  clearThrottle,
  prismaThrottleStore,
  registerFailure,
  throttleKeys,
  type ThrottleStore,
} from "@/lib/login-throttle";

/**
 * Error que Auth.js devuelve al cliente como `code: "locked"`: la pantalla de
 * login muestra "demasiados intentos" en vez de "usuario o contraseña incorrectos".
 * El código viaja en la URL, así que no dice nada del usuario (ver CP-45).
 */
export class LoginLockedError extends CredentialsSignin {
  code = "locked";
}

// Hash de relleno con el mismo costo (12) que las contraseñas reales: se compara
// contra él cuando el usuario no existe, para que la respuesta tarde lo mismo
// (CP-46, hallazgo H4). Se calcula una vez por instancia.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomBytes(32).toString("hex"), 12);
  return dummyHash;
}

/**
 * Si la tabla de intentos falla (p. ej. la migración aún no corrió en esa base),
 * el login sigue funcionando sin límite: dejar a todos fuera es peor. Queda en el log.
 */
async function failOpen<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[login-throttle] ${label}: sin límite de intentos para este request`, err);
    return fallback;
  }
}

type Deps = { store?: ThrottleStore; now?: () => Date };

/** `authorize` del proveedor Credentials (src/lib/auth.ts). */
export async function authorizeCredentials(
  credentials: Partial<Record<string, unknown>> | undefined,
  request: Request | undefined,
  { store = prismaThrottleStore, now = () => new Date() }: Deps = {},
) {
  const username = typeof credentials?.username === "string" ? credentials.username : "";
  const password = typeof credentials?.password === "string" ? credentials.password : "";
  if (!username || !password) return null;

  const { ip, userAgent } =
    request instanceof Request ? getClientInfo(request) : { ip: null, userAgent: null };
  const keys = throttleKeys(username, ip);

  // Bloqueado: se responde igual exista o no el usuario, sin consultar la base.
  if ((await failOpen("checkLock", () => checkLock(store, keys, now()), 0)) > 0) {
    throw new LoginLockedError();
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { employee: true },
  });
  // bcrypt SIEMPRE, también para usuarios inexistentes o desactivados (CP-46).
  const valid = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !user.active || !valid) {
    const { lockedMs } = await failOpen(
      "registerFailure",
      () => registerFailure(store, keys, now()),
      { lockedMs: 0 },
    );
    // Usuario inexistente: no hay tenant al cual asociar el evento → no se audita.
    if (user) {
      const motivo = !user.active
        ? `Intento de inicio de sesión de usuario desactivado @${user.username}`
        : `Intento de inicio de sesión fallido (contraseña incorrecta) de @${user.username}`;
      const bloqueo = lockedMs > 0
        ? `. Inicio de sesión bloqueado ${Math.round(lockedMs / 60_000)} min por intentos fallidos`
        : "";
      await recordAudit({
        tenantId: user.tenantId,
        userId: user.id,
        username: user.username,
        role: user.role,
        action: "LOGIN_FAILED",
        module: "AUTH",
        description: motivo + bloqueo,
        ip,
        userAgent,
        result: "FAILURE",
      });
    }
    if (lockedMs > 0) throw new LoginLockedError();
    return null;
  }

  await failOpen("clearThrottle", () => clearThrottle(store, keys), undefined);
  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    username: user.username,
    role: user.role,
    action: "LOGIN",
    module: "AUTH",
    description: `@${user.username} inició sesión`,
    ip,
    userAgent,
  });
  return {
    id: user.id,
    name: user.username,
    email: null, // NextAuth requires this field even if unused
    role: user.role,
    tenantId: user.tenantId,
    employeeId: user.employeeId,
    sessionVersion: user.sessionVersion,
  };
}
