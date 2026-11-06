/**
 * Restablece la contraseña de UN usuario, sin tocar a los demás.
 *
 * Pensado para el caso que la aplicación no cubre: el PROPRIETARY olvidó su
 * contraseña (nadie puede editarlo desde la UI). Para cualquier otro usuario, usar
 * la UI: Usuarios del portal → Restablecer contraseña (PROPRIETARY o SUPERADMIN).
 *
 * Qué hace, en una transacción:
 *   - guarda el hash bcrypt (costo 12) de la nueva contraseña;
 *   - incrementa sessionVersion: cierra las sesiones abiertas del usuario (RN-19);
 *   - borra sus contadores de intentos fallidos: queda desbloqueado (CP-45);
 *   - deja un evento UPDATE en la auditoría del tenant.
 *
 * La contraseña sale de NX_PASSWORD_<USUARIO> (mín. 10 caracteres) o se genera
 * al azar y se muestra UNA sola vez en esta consola. Nunca se escribe en un archivo.
 *
 * Uso (PowerShell), con las credenciales de la base del cliente:
 *   $env:TURSO_DATABASE_URL="libsql://<cliente>.turso.io"
 *   $env:TURSO_AUTH_TOKEN="eyJ..."
 *   node scripts/reset-password.mjs <usuario>            # simulación: no escribe
 *   node scripts/reset-password.mjs <usuario> --si       # aplica el cambio
 *
 * Opcional: $env:NX_PASSWORD_<USUARIO>="..." para fijar la clave en vez de generarla.
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { passwordFor, printGeneratedPasswords, requireEnv } from "./lib/credentials.mjs";

const [username, flag] = process.argv.slice(2);
if (!username || username.startsWith("-")) {
  console.error("Uso: node scripts/reset-password.mjs <usuario> [--si]");
  process.exit(1);
}
const apply = flag === "--si";

const url = requireEnv("TURSO_DATABASE_URL");
const authToken = process.env.TURSO_AUTH_TOKEN;
if (url.startsWith("libsql://") && !authToken) {
  console.error("❌ Falta TURSO_AUTH_TOKEN para una base remota");
  process.exit(1);
}
const db = createClient(authToken ? { url, authToken } : { url });
// Mismo formato de fecha que guarda Prisma en SQLite/libSQL ("…+00:00", no "…Z").
const nowIso = () => new Date().toISOString().replace("Z", "+00:00");

try {
  console.log(`Base: ${url.replace(/\/\/([^.]{3})[^.]*/, "//$1***")}`);
  const found = await db.execute({
    sql: `SELECT "id", "tenantId", "username", "role", "active" FROM "User" WHERE "username" = ?`,
    args: [username],
  });
  const user = found.rows[0];
  if (!user) {
    console.error(`❌ No existe el usuario "${username}" en esta base`);
    process.exit(1);
  }
  console.log(`Usuario: @${user.username} (${user.role}${user.active ? "" : ", DESACTIVADO"})`);

  if (!apply) {
    console.log("\nSimulación: no se cambió nada. Repite con --si para aplicar.");
    process.exit(0);
  }

  const password = passwordFor(String(user.username));
  const hash = await bcrypt.hash(password, 12);
  const userKey = `u:${String(user.username).trim().toLowerCase().slice(0, 100)}`;

  await db.batch(
    [
      {
        sql: `UPDATE "User" SET "passwordHash" = ?, "sessionVersion" = "sessionVersion" + 1, "updatedAt" = ? WHERE "id" = ?`,
        args: [hash, nowIso(), user.id],
      },
      {
        // Mismo criterio que unlockLogin() en src/lib/login-throttle.ts (filtro exacto,
        // sin comodines de LIKE).
        sql: `DELETE FROM "LoginThrottle" WHERE "key" = ? OR substr("key", 1, ?) = ?`,
        args: [userKey, userKey.length + 4, `${userKey}|ip:`],
      },
      {
        sql: `INSERT INTO "AuditLog" ("id", "tenantId", "username", "role", "action", "module", "entityId", "entityLabel", "description", "result", "createdAt")
              VALUES (?, ?, 'script', 'SYSTEM', 'UPDATE', 'USERS', ?, ?, ?, 'SUCCESS', ?)`,
        args: [
          randomUUID(), user.tenantId, user.id, user.username,
          `Restableció la contraseña de "@${user.username}" con scripts/reset-password.mjs`,
          nowIso(),
        ],
      },
    ],
    "write",
  );

  console.log("\n✅ Contraseña restablecida, sesiones cerradas e intentos fallidos borrados.");
  printGeneratedPasswords();
} catch (err) {
  console.error(`\n❌ ${err.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
