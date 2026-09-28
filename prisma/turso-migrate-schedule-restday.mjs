/**
 * Añade la columna `restDay` a `ScheduleShift`, para marcar días de descanso en
 * los horarios. Seguro para ejecutar múltiples veces (idempotente).
 *
 * A diferencia de los scripts de migración anteriores, que hablan con la API
 * HTTP de Turso, este usa `@libsql/client` — el mismo cliente que la aplicación
 * (`src/lib/db.ts`). Así el mismo script sirve para la base local
 * (`file:./dev.db`) y para Turso en producción (`libsql://…`), sin dos caminos
 * de código que puedan divergir.
 *
 * Uso (PowerShell) — local:
 *   $env:TURSO_DATABASE_URL="file:./dev.db"
 *   node prisma/turso-migrate-schedule-restday.mjs
 *
 * Uso (PowerShell) — producción:
 *   $env:TURSO_DATABASE_URL="libsql://your-db.turso.io"
 *   $env:TURSO_AUTH_TOKEN="eyJ..."
 *   node prisma/turso-migrate-schedule-restday.mjs
 *
 * ROLLBACK:
 *   ALTER TABLE "ScheduleShift" DROP COLUMN "restDay";
 *
 *   No hace falta ejecutarlo para volver a la versión anterior del código: con
 *   la columna presente y todas las filas en `false`, el sistema anterior
 *   funciona exactamente igual. La columna es aditiva y no altera ningún dato
 *   existente — los turnos ya guardados quedan con `restDay = false` y sus
 *   horas intactas.
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

/** Ejecuta una sentencia tolerando el error de "ya existe" (idempotencia). */
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
  console.log("🔄  Migración: día de descanso en horarios");
  console.log(`    Base: ${url}\n`);

  await exec(
    `ALTER TABLE "ScheduleShift" ADD COLUMN "restDay" BOOLEAN NOT NULL DEFAULT false`,
    "ScheduleShift.restDay"
  );

  // Verificación: la columna tiene que existir y los turnos previos seguir intactos.
  const cols = await db.execute(`PRAGMA table_info("ScheduleShift")`);
  const hasColumn = cols.rows.some((r) => r.name === "restDay");
  if (!hasColumn) {
    throw new Error("La columna restDay no aparece en el esquema tras migrar");
  }

  const counts = await db.execute(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN "restDay" THEN 1 ELSE 0 END) AS descansos
     FROM "ScheduleShift"`
  );
  const { total, descansos } = counts.rows[0];

  console.log(`\n📊  Turnos existentes: ${total} (días de descanso: ${descansos ?? 0})`);
  console.log("✅  Migración completada\n");
}

migrate()
  .catch((err) => {
    console.error(`\n❌  ${err.message}\n`);
    process.exit(1);
  })
  .finally(() => db.close());
