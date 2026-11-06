/**
 * Crea la tabla `LoginThrottle`: contadores de intentos fallidos de inicio de
 * sesión (CP-45 del Plan de Calidad, hallazgo H3). Seguro para ejecutar varias veces.
 *
 * Usa `@libsql/client`, el mismo cliente que la aplicación: sirve igual para la
 * base local (`file:./dev.db`) y para Turso (`libsql://…`).
 *
 * ORDEN DE DESPLIEGUE: correr esta migración en la base del cliente ANTES de
 * promover el código. Si el código llega primero el login NO se rompe (el límite
 * de intentos falla abierto y lo deja en el log), pero esa instancia queda sin
 * límite de intentos hasta que se migre.
 *
 * Uso (PowerShell) — local:
 *   $env:TURSO_DATABASE_URL="file:./dev.db"
 *   node prisma/turso-migrate-login-throttle.mjs
 *
 * Uso (PowerShell) — producción:
 *   $env:TURSO_DATABASE_URL="libsql://your-db.turso.io"
 *   $env:TURSO_AUTH_TOKEN="eyJ..."
 *   node prisma/turso-migrate-login-throttle.mjs
 *
 * ROLLBACK:
 *   DROP TABLE "LoginThrottle";
 *
 *   La tabla es nueva y solo guarda contadores temporales: borrarla no pierde
 *   datos de negocio. El código anterior no la usa.
 */

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "";
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error("❌  Falta TURSO_DATABASE_URL");
  process.exit(1);
}
if (url.startsWith("libsql://") && !authToken) {
  console.error("❌  Falta TURSO_AUTH_TOKEN para una base remota");
  process.exit(1);
}

const db = createClient(authToken ? { url, authToken } : { url });

async function migrate() {
  console.log("🔄  Migración: límite de intentos de inicio de sesión");
  console.log(`    Base: ${url.replace(/\/\/([^.]{3})[^.]*/, "//$1***")}\n`);

  // Mismo SQL que genera Prisma para el modelo LoginThrottle (DateTime = DATETIME).
  await db.execute(`CREATE TABLE IF NOT EXISTS "LoginThrottle" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStart" DATETIME NOT NULL,
    "lockedUntil" DATETIME,
    "lockCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" DATETIME NOT NULL
  )`);
  console.log("  ✅  Tabla LoginThrottle");

  await db.execute(
    `CREATE INDEX IF NOT EXISTS "LoginThrottle_lastFailureAt_idx" ON "LoginThrottle"("lastFailureAt")`,
  );
  console.log("  ✅  Índice LoginThrottle_lastFailureAt_idx");

  const cols = await db.execute(`PRAGMA table_info("LoginThrottle")`);
  const names = cols.rows.map((r) => r.name);
  for (const c of ["key", "failures", "windowStart", "lockedUntil", "lockCount", "lastFailureAt"]) {
    if (!names.includes(c)) throw new Error(`Falta la columna ${c} tras migrar`);
  }
  console.log("✅  Migración completada\n");
}

migrate()
  .catch((err) => {
    console.error(`\n❌  ${err.message}\n`);
    process.exit(1);
  })
  .finally(() => db.close());
