/**
 * Agrega columnas faltantes a las tablas de producción en Turso.
 * Las migraciones de schema.prisma no se habían aplicado a la BD de producción.
 * Ejecutar: node scripts/fix-missing-columns.mjs
 */
import { createClient } from "@libsql/client";

const db = createClient({
  url: "libsql://nominaxpress-fiori-camilo1408.aws-us-east-1.turso.io",
  authToken: "***REMOVED***",
});

// 1. Ver columnas actuales de cada tabla afectada
async function getColumns(table) {
  const info = await db.execute(`PRAGMA table_info("${table}")`);
  return new Set(info.rows.map(r => r.name));
}

const alterStatements = [
  // Employee: columnas añadidas en migraciones posteriores
  { table: "Employee", col: "tipPercent",       sql: `ALTER TABLE "Employee" ADD COLUMN "tipPercent" REAL NOT NULL DEFAULT 100` },
  { table: "Employee", col: "payType",          sql: `ALTER TABLE "Employee" ADD COLUMN "payType" TEXT NOT NULL DEFAULT 'PAYROLL'` },

  // TimeEntry: columnas de segundo turno
  { table: "TimeEntry", col: "checkIn2",        sql: `ALTER TABLE "TimeEntry" ADD COLUMN "checkIn2" DATETIME` },
  { table: "TimeEntry", col: "checkOut2",       sql: `ALTER TABLE "TimeEntry" ADD COLUMN "checkOut2" DATETIME` },
  { table: "TimeEntry", col: "notes",           sql: `ALTER TABLE "TimeEntry" ADD COLUMN "notes" TEXT` },

  // Schedule: columna published
  { table: "Schedule", col: "published",        sql: `ALTER TABLE "Schedule" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false` },

  // ScheduleShift: columnas de segundo turno
  { table: "ScheduleShift", col: "startTime2",  sql: `ALTER TABLE "ScheduleShift" ADD COLUMN "startTime2" TEXT` },
  { table: "ScheduleShift", col: "endTime2",    sql: `ALTER TABLE "ScheduleShift" ADD COLUMN "endTime2" TEXT` },

  // Bonus: columnas nuevas
  { table: "Bonus", col: "valueType",           sql: `ALTER TABLE "Bonus" ADD COLUMN "valueType" TEXT NOT NULL DEFAULT 'STANDARD'` },
  { table: "Bonus", col: "amount",              sql: `ALTER TABLE "Bonus" ADD COLUMN "amount" REAL NOT NULL DEFAULT 0` },
  { table: "Bonus", col: "assignmentType",      sql: `ALTER TABLE "Bonus" ADD COLUMN "assignmentType" TEXT NOT NULL DEFAULT 'ALL'` },
  { table: "Bonus", col: "frequency",           sql: `ALTER TABLE "Bonus" ADD COLUMN "frequency" TEXT NOT NULL DEFAULT 'BIWEEKLY'` },
  { table: "Bonus", col: "monthlyMode",         sql: `ALTER TABLE "Bonus" ADD COLUMN "monthlyMode" TEXT` },
  { table: "Bonus", col: "createdById",         sql: `ALTER TABLE "Bonus" ADD COLUMN "createdById" TEXT` },

  // BonusAssignment: amount optional y active
  { table: "BonusAssignment", col: "amount",    sql: `ALTER TABLE "BonusAssignment" ADD COLUMN "amount" REAL` },
  { table: "BonusAssignment", col: "active",    sql: `ALTER TABLE "BonusAssignment" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true` },
  { table: "BonusAssignment", col: "updatedAt", sql: `ALTER TABLE "BonusAssignment" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` },

  // Discount: columnas nuevas
  { table: "Discount", col: "valueType",        sql: `ALTER TABLE "Discount" ADD COLUMN "valueType" TEXT NOT NULL DEFAULT 'STANDARD'` },
  { table: "Discount", col: "amount",           sql: `ALTER TABLE "Discount" ADD COLUMN "amount" REAL NOT NULL DEFAULT 0` },
  { table: "Discount", col: "assignmentType",   sql: `ALTER TABLE "Discount" ADD COLUMN "assignmentType" TEXT NOT NULL DEFAULT 'ALL'` },
  { table: "Discount", col: "frequency",        sql: `ALTER TABLE "Discount" ADD COLUMN "frequency" TEXT NOT NULL DEFAULT 'BIWEEKLY'` },
  { table: "Discount", col: "monthlyMode",      sql: `ALTER TABLE "Discount" ADD COLUMN "monthlyMode" TEXT` },
  { table: "Discount", col: "createdById",      sql: `ALTER TABLE "Discount" ADD COLUMN "createdById" TEXT` },

  // DiscountAssignment
  { table: "DiscountAssignment", col: "amount",    sql: `ALTER TABLE "DiscountAssignment" ADD COLUMN "amount" REAL` },
  { table: "DiscountAssignment", col: "active",    sql: `ALTER TABLE "DiscountAssignment" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true` },
  { table: "DiscountAssignment", col: "updatedAt", sql: `ALTER TABLE "DiscountAssignment" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` },

  // User: columna heredada ya existe pero por si acaso
  { table: "User", col: "customRoleId",         sql: `ALTER TABLE "User" ADD COLUMN "customRoleId" TEXT` },
];

console.log("=== DIAGNÓSTICO DE COLUMNAS ===\n");

// Primero mostrar columnas actuales
for (const tableName of ["Employee", "TimeEntry", "Schedule", "ScheduleShift", "Bonus", "BonusAssignment", "Discount", "DiscountAssignment"]) {
  try {
    const cols = await getColumns(tableName);
    console.log(`[${tableName}]: ${[...cols].join(", ")}`);
  } catch(e) {
    console.log(`[${tableName}]: ERROR - ${e.message}`);
  }
}

console.log("\n=== APLICANDO ALTER TABLE ===\n");

let ok = 0, skip = 0, fail = 0;
for (const { table, col, sql } of alterStatements) {
  try {
    const cols = await getColumns(table);
    if (cols.has(col)) {
      console.log(`  ⊙ ${table}.${col}: ya existe, saltando`);
      skip++;
      continue;
    }
    await db.execute(sql);
    console.log(`  ✓ ${table}.${col}: AGREGADA`);
    ok++;
  } catch (e) {
    if (e.message.includes("duplicate column") || e.message.includes("already exists")) {
      console.log(`  ⊙ ${table}.${col}: ya existe (duplicate)`);
      skip++;
    } else {
      console.log(`  ✗ ${table}.${col}: ERROR - ${e.message}`);
      fail++;
    }
  }
}

console.log(`\nResultado: ${ok} agregadas, ${skip} ya existían, ${fail} fallidas`);

await db.close();
