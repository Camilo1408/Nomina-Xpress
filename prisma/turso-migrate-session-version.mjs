/**
 * Añade la columna `sessionVersion` a `User`, para poder revocar sesiones JWT
 * (RN-19 del Plan de Calidad: desactivar un usuario, cambiar su contraseña o su
 * rol cierra sus sesiones abiertas). Seguro para ejecutar múltiples veces.
 *
 * Usa `@libsql/client`, el mismo cliente que la aplicación: sirve igual para la
 * base local (`file:./dev.db`) y para Turso (`libsql://…`).
 *
 * ORDEN DE DESPLIEGUE: correr esta migración en la base del cliente ANTES de
 * promover el código que lee la columna (si el código llega primero, Prisma falla
 * al leer User y nadie puede iniciar sesión).
 *
 * Uso (PowerShell) — local:
 *   $env:TURSO_DATABASE_URL="file:./dev.db"
 *   node prisma/turso-migrate-session-version.mjs
 *
 * Uso (PowerShell) — producción:
 *   $env:TURSO_DATABASE_URL="libsql://your-db.turso.io"
 *   $env:TURSO_AUTH_TOKEN="eyJ..."
 *   node prisma/turso-migrate-session-version.mjs
 *
 * ROLLBACK:
 *   ALTER TABLE "User" DROP COLUMN "sessionVersion";
 *
 *   No hace falta para volver al código anterior: la columna es aditiva, todas
 *   las filas quedan en 0 y el código previo simplemente no la lee. Los tokens ya
 *   emitidos (sin versión) cuentan como 0, así que la migración no cierra la
 *   sesión de nadie.
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

async function exec(sql, label) {
  try {
    await db.execute(sql);
    console.log(`  ✅  ${label}`);
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (msg.includes("duplicate column") || msg.includes("already exists")) {
      console.log(`  ⚠️  ${label} — ya existe, omitiendo`);
    } else {
      throw new Error(`SQL error en "${label}": ${msg}`);
    }
  }
}

async function migrate() {
  console.log("🔄  Migración: versión de sesión en usuarios");
  console.log(`    Base: ${url.replace(/\/\/([^.]{3})[^.]*/, "//$1***")}\n`);

  await exec(
    `ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0`,
    "User.sessionVersion"
  );

  const cols = await db.execute(`PRAGMA table_info("User")`);
  if (!cols.rows.some((r) => r.name === "sessionVersion")) {
    throw new Error("La columna sessionVersion no aparece en el esquema tras migrar");
  }
  const counts = await db.execute(`SELECT COUNT(*) AS total FROM "User"`);
  console.log(`\n📊  Usuarios existentes: ${counts.rows[0].total} (todos con sessionVersion = 0)`);
  console.log("✅  Migración completada\n");
}

migrate()
  .catch((err) => {
    console.error(`\n❌  ${err.message}\n`);
    process.exit(1);
  })
  .finally(() => db.close());
