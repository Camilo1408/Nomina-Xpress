/**
 * Migración del módulo de concursos e incentivos.
 *
 * Crea 6 tablas nuevas y añade 1 columna con default a TipEntry.
 * NO modifica ninguna otra tabla existente y NO reescribe ningún dato.
 *
 * Es IDEMPOTENTE: se puede ejecutar tantas veces como haga falta.
 *
 * Uso local:
 *   TURSO_DATABASE_URL=file:./dev.db node prisma/turso-migrate-concursos.mjs
 *   (o simplemente `node prisma/turso-migrate-concursos.mjs`, que lee .env.local)
 *
 * Uso producción (solo con autorización explícita y backup previo):
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node prisma/turso-migrate-concursos.mjs
 *
 * Rollback: prisma/turso-rollback-concursos.mjs
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { existsSync } from "fs";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) config({ path: f, override: false, quiet: true });
}

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("Falta TURSO_DATABASE_URL. Abortando sin tocar la base de datos.");
  process.exit(1);
}

const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

// ─── DDL ──────────────────────────────────────────────────────────────────────
// Se escribe a mano en vez de generarlo con Prisma porque el historial de
// migraciones del repo está desincronizado desde junio de 2026 y `_prisma_migrations`
// está vacía en local. Este script es autocontenido y no depende de ese historial.

const TABLES = [
  {
    name: "Contest",
    sql: `CREATE TABLE IF NOT EXISTS "Contest" (
      "id"            TEXT PRIMARY KEY NOT NULL,
      "tenantId"      TEXT NOT NULL,
      "name"          TEXT NOT NULL,
      "description"   TEXT,
      "startDate"     TEXT NOT NULL,
      "endDate"       TEXT NOT NULL,
      "status"        TEXT NOT NULL DEFAULT 'BORRADOR',
      "payoutMode"    TEXT NOT NULL DEFAULT 'UNICO',
      "activatedAt"   DATETIME,
      "activatedById" TEXT,
      "finalizedAt"   DATETIME,
      "finalizedById" TEXT,
      "cancelledAt"   DATETIME,
      "cancelledById" TEXT,
      "cancelReason"  TEXT,
      "createdById"   TEXT,
      "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Contest_tenantId_fkey" FOREIGN KEY ("tenantId")
        REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: "ContestItem",
    sql: `CREATE TABLE IF NOT EXISTS "ContestItem" (
      "id"           TEXT PRIMARY KEY NOT NULL,
      "tenantId"     TEXT NOT NULL,
      "contestId"    TEXT NOT NULL,
      "name"         TEXT NOT NULL,
      "description"  TEXT,
      "goalValue"    REAL NOT NULL,
      "goalUnit"     TEXT NOT NULL DEFAULT 'unidades',
      "criteria"     TEXT NOT NULL DEFAULT 'MAYOR_VALOR',
      "percent"      REAL NOT NULL,
      "winnerMode"   TEXT NOT NULL DEFAULT 'GANADOR_UNICO',
      "outcome"      TEXT NOT NULL DEFAULT 'PENDIENTE',
      "resolvedAt"   DATETIME,
      "resolvedById" TEXT,
      "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContestItem_tenantId_fkey" FOREIGN KEY ("tenantId")
        REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ContestItem_contestId_fkey" FOREIGN KEY ("contestId")
        REFERENCES "Contest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: "ContestItemResult",
    sql: `CREATE TABLE IF NOT EXISTS "ContestItemResult" (
      "id"            TEXT PRIMARY KEY NOT NULL,
      "tenantId"      TEXT NOT NULL,
      "contestItemId" TEXT NOT NULL,
      "employeeId"    TEXT NOT NULL,
      "value"         REAL NOT NULL,
      "achievedAt"    DATETIME,
      "notes"         TEXT,
      "recordedById"  TEXT,
      "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContestItemResult_tenantId_fkey" FOREIGN KEY ("tenantId")
        REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ContestItemResult_contestItemId_fkey" FOREIGN KEY ("contestItemId")
        REFERENCES "ContestItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ContestItemResult_employeeId_fkey" FOREIGN KEY ("employeeId")
        REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: "ContestTipReserve",
    sql: `CREATE TABLE IF NOT EXISTS "ContestTipReserve" (
      "id"             TEXT PRIMARY KEY NOT NULL,
      "tenantId"       TEXT NOT NULL,
      "contestId"      TEXT NOT NULL,
      "contestItemId"  TEXT NOT NULL,
      "tipEntryId"     TEXT NOT NULL,
      "date"           TEXT NOT NULL,
      "tipTotalAmount" REAL NOT NULL,
      "percent"        REAL NOT NULL,
      "amount"         REAL NOT NULL,
      "status"         TEXT NOT NULL DEFAULT 'RESERVADA',
      "refundedAt"     DATETIME,
      "refundReason"   TEXT,
      "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContestTipReserve_tenantId_fkey" FOREIGN KEY ("tenantId")
        REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ContestTipReserve_contestItemId_fkey" FOREIGN KEY ("contestItemId")
        REFERENCES "ContestItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ContestTipReserve_tipEntryId_fkey" FOREIGN KEY ("tipEntryId")
        REFERENCES "TipEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: "ContestBonus",
    sql: `CREATE TABLE IF NOT EXISTS "ContestBonus" (
      "id"               TEXT PRIMARY KEY NOT NULL,
      "tenantId"         TEXT NOT NULL,
      "contestId"        TEXT NOT NULL,
      "contestItemId"    TEXT NOT NULL,
      "employeeId"       TEXT NOT NULL,
      "contestName"      TEXT NOT NULL,
      "itemName"         TEXT NOT NULL,
      "goalSnapshot"     TEXT NOT NULL,
      "criteriaSnapshot" TEXT NOT NULL,
      "percentSnapshot"  REAL NOT NULL,
      "tipBaseSnapshot"  REAL NOT NULL,
      "reservedAmount"   REAL NOT NULL,
      "resultValue"      REAL NOT NULL,
      "periodStart"      TEXT NOT NULL,
      "periodEnd"        TEXT NOT NULL,
      "shareRatio"       REAL NOT NULL DEFAULT 1,
      "totalAmount"      REAL NOT NULL,
      "paidAmount"       REAL NOT NULL DEFAULT 0,
      "status"           TEXT NOT NULL DEFAULT 'PENDIENTE',
      "voidedAt"         DATETIME,
      "voidReason"       TEXT,
      "assignedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "assignedById"     TEXT,
      "updatedAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContestBonus_tenantId_fkey" FOREIGN KEY ("tenantId")
        REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ContestBonus_contestItemId_fkey" FOREIGN KEY ("contestItemId")
        REFERENCES "ContestItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ContestBonus_employeeId_fkey" FOREIGN KEY ("employeeId")
        REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
  },
  {
    name: "ContestBonusPayment",
    sql: `CREATE TABLE IF NOT EXISTS "ContestBonusPayment" (
      "id"             TEXT PRIMARY KEY NOT NULL,
      "tenantId"       TEXT NOT NULL,
      "contestBonusId" TEXT NOT NULL,
      "employeeId"     TEXT NOT NULL,
      "installment"    INTEGER NOT NULL,
      "periodStart"    TEXT NOT NULL,
      "periodEnd"      TEXT NOT NULL,
      "amount"         REAL NOT NULL,
      "status"         TEXT NOT NULL DEFAULT 'PENDIENTE',
      "paidAt"         DATETIME,
      "paidById"       TEXT,
      "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContestBonusPayment_tenantId_fkey" FOREIGN KEY ("tenantId")
        REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ContestBonusPayment_contestBonusId_fkey" FOREIGN KEY ("contestBonusId")
        REFERENCES "ContestBonus" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS "Contest_tenantId_idx" ON "Contest" ("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "Contest_tenantId_status_idx" ON "Contest" ("tenantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "Contest_tenantId_startDate_endDate_idx" ON "Contest" ("tenantId", "startDate", "endDate")`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "ContestItem_contestId_name_key" ON "ContestItem" ("contestId", "name")`,
  `CREATE INDEX IF NOT EXISTS "ContestItem_tenantId_idx" ON "ContestItem" ("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "ContestItem_contestId_idx" ON "ContestItem" ("contestId")`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "ContestItemResult_contestItemId_employeeId_key" ON "ContestItemResult" ("contestItemId", "employeeId")`,
  `CREATE INDEX IF NOT EXISTS "ContestItemResult_tenantId_idx" ON "ContestItemResult" ("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "ContestItemResult_contestItemId_idx" ON "ContestItemResult" ("contestItemId")`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "ContestTipReserve_tipEntryId_contestItemId_key" ON "ContestTipReserve" ("tipEntryId", "contestItemId")`,
  `CREATE INDEX IF NOT EXISTS "ContestTipReserve_tenantId_idx" ON "ContestTipReserve" ("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "ContestTipReserve_contestItemId_status_idx" ON "ContestTipReserve" ("contestItemId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ContestTipReserve_tenantId_date_idx" ON "ContestTipReserve" ("tenantId", "date")`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "ContestBonus_contestItemId_employeeId_key" ON "ContestBonus" ("contestItemId", "employeeId")`,
  `CREATE INDEX IF NOT EXISTS "ContestBonus_tenantId_idx" ON "ContestBonus" ("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "ContestBonus_tenantId_status_idx" ON "ContestBonus" ("tenantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ContestBonus_tenantId_employeeId_idx" ON "ContestBonus" ("tenantId", "employeeId")`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "ContestBonusPayment_contestBonusId_installment_key" ON "ContestBonusPayment" ("contestBonusId", "installment")`,
  `CREATE INDEX IF NOT EXISTS "ContestBonusPayment_tenantId_idx" ON "ContestBonusPayment" ("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "ContestBonusPayment_tenantId_employeeId_periodStart_periodEnd_idx" ON "ContestBonusPayment" ("tenantId", "employeeId", "periodStart", "periodEnd")`,
  `CREATE INDEX IF NOT EXISTS "ContestBonusPayment_tenantId_status_idx" ON "ContestBonusPayment" ("tenantId", "status")`,
];

async function columnExists(table, column) {
  const res = await db.execute(`PRAGMA table_info("${table}")`);
  return res.rows.some((r) => r.name === column);
}

async function tableExists(table) {
  const res = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    args: [table],
  });
  return res.rows.length > 0;
}

async function main() {
  console.log(`Base de datos: ${url}`);
  console.log("Migración: concursos e incentivos\n");

  // Guarda: la base debe ser la de nómina, no una vacía por error de configuración.
  if (!(await tableExists("TipEntry"))) {
    console.error(
      "ERROR: no existe la tabla TipEntry. Esta no parece la base de datos de Nómina Xpress."
    );
    console.error("Abortando sin realizar ningún cambio.");
    process.exit(1);
  }

  let created = 0;
  for (const { name, sql } of TABLES) {
    const existed = await tableExists(name);
    await db.execute(sql);
    if (existed) {
      console.log(`  = ${name} (ya existía)`);
    } else {
      console.log(`  + ${name} creada`);
      created++;
    }
  }

  console.log("");
  if (await columnExists("TipEntry", "contestReserved")) {
    console.log("  = TipEntry.contestReserved (ya existía)");
  } else {
    // Default 0: todas las filas históricas conservan totalAmount = menaje + netAmount.
    // No se recalcula ni se reescribe ningún registro existente.
    await db.execute(
      `ALTER TABLE "TipEntry" ADD COLUMN "contestReserved" REAL NOT NULL DEFAULT 0`
    );
    console.log("  + TipEntry.contestReserved añadida (default 0)");
  }

  console.log("");
  for (const sql of INDEXES) await db.execute(sql);
  console.log(`  ✓ ${INDEXES.length} índices verificados`);

  // Verificación post-migración
  console.log("\nVerificación:");
  for (const { name } of TABLES) {
    const ok = await tableExists(name);
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) process.exitCode = 1;
  }
  const colOk = await columnExists("TipEntry", "contestReserved");
  console.log(`  ${colOk ? "✓" : "✗"} TipEntry.contestReserved`);
  if (!colOk) process.exitCode = 1;

  const tips = await db.execute(
    `SELECT COUNT(*) AS n FROM "TipEntry" WHERE "contestReserved" != 0`
  );
  console.log(
    `  ✓ ${tips.rows[0].n} registros de propinas con reserva de concurso (esperado 0 tras migrar)`
  );

  console.log(
    `\nListo. ${created} tabla(s) creada(s). Ningún dato existente fue modificado.`
  );
  await db.close();
}

main().catch(async (err) => {
  console.error("\nERROR en la migración:", err.message);
  console.error("Ninguna operación posterior se ejecutó. Revisar antes de reintentar.");
  await db.close().catch(() => {});
  process.exit(1);
});
