/**
 * Applies all Prisma migrations + seed data to a Turso database
 * via its HTTP API. No extra npm packages needed — uses built-in fetch.
 *
 * Usage:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node prisma/turso-setup.mjs
 */

const DB_URL = (process.env.TURSO_DATABASE_URL ?? "")
  .replace("libsql://", "https://");
const TOKEN = process.env.TURSO_AUTH_TOKEN ?? "";

if (!DB_URL || !TOKEN) {
  console.error("❌ Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN");
  process.exit(1);
}

async function exec(sql) {
  const stmts = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--") && !s.startsWith("/*"));

  for (const stmt of stmts) {
    const clean = stmt.replace(/;$/, "").trim();
    if (!clean) continue;

    const res = await fetch(`${DB_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: clean } },
          { type: "close" },
        ],
      }),
    });

    const data = await res.json();
    if (data.results?.[0]?.type === "error") {
      const msg = data.results[0].error?.message ?? JSON.stringify(data);
      // Ignorar "already exists" para idempotencia
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
        process.stdout.write("⚠");
      } else {
        throw new Error(`SQL error: ${msg}\n→ ${clean.slice(0, 80)}`);
      }
    } else {
      process.stdout.write(".");
    }
  }
}

// ── Migrations ────────────────────────────────────────────────────────────────

const M1 = `
CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "logoUrl" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#C1643F',
  "secondaryColor" TEXT NOT NULL DEFAULT '#8B6355',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Employee" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "documentId" TEXT,
  "phone" TEXT,
  "hourlyRateNormal" REAL NOT NULL DEFAULT 6400,
  "hourlyRateSpecial" REAL NOT NULL DEFAULT 11500,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
  "employeeId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "TimeEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "checkIn" DATETIME NOT NULL,
  "checkOut" DATETIME,
  "checkIn2" DATETIME,
  "checkOut2" DATETIME,
  "isSpecial" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TimeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Schedule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "weekStart" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Schedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ScheduleShift" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scheduleId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "startTime2" TEXT,
  "endTime2" TEXT,
  CONSTRAINT "ScheduleShift_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScheduleShift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PayAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "description" TEXT NOT NULL,
  "periodStart" TEXT NOT NULL,
  "periodEnd" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PayAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX "Employee_tenantId_idx" ON "Employee"("tenantId");
CREATE INDEX "TimeEntry_tenantId_employeeId_idx" ON "TimeEntry"("tenantId", "employeeId");
CREATE INDEX "TimeEntry_tenantId_date_idx" ON "TimeEntry"("tenantId", "date");
CREATE INDEX "Schedule_tenantId_idx" ON "Schedule"("tenantId");
CREATE INDEX "ScheduleShift_scheduleId_idx" ON "ScheduleShift"("scheduleId");
CREATE INDEX "ScheduleShift_employeeId_idx" ON "ScheduleShift"("employeeId");
CREATE INDEX "PayAdjustment_tenantId_employeeId_idx" ON "PayAdjustment"("tenantId", "employeeId")
`;

// ── Seed data ─────────────────────────────────────────────────────────────────
// Hashes pre-generados: admin123 y emp123 con bcrypt rounds=12
const ADMIN_HASH = "$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi"; // admin123
const EMP_HASH   = "$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi"; // placeholder

async function seed() {
  // Generar IDs con crypto
  const { randomUUID } = await import("crypto");
  const tenantId   = randomUUID();
  const adminId    = randomUUID();
  const empUserId  = randomUUID();
  const empId      = randomUUID();
  const now        = new Date().toISOString();

  // Importar bcryptjs desde node_modules (ya instalado)
  const bcrypt = await import("bcryptjs").then(m => m.default ?? m);
  const adminHash = await bcrypt.hash("admin123", 12);
  const empHash   = await bcrypt.hash("emp123", 12);

  console.log("\n🌱 Seeding...");

  await exec(`INSERT OR IGNORE INTO "Tenant" (id, name, "primaryColor", "secondaryColor", "createdAt", "updatedAt")
    VALUES ('${tenantId}', 'Cucina dei Fiori', '#C1643F', '#8B6355', '${now}', '${now}')`);

  await exec(`INSERT OR IGNORE INTO "User" (id, "tenantId", username, "passwordHash", role, "createdAt", "updatedAt")
    VALUES ('${adminId}', '${tenantId}', 'admin', '${adminHash}', 'ADMIN', '${now}', '${now}')`);

  await exec(`INSERT OR IGNORE INTO "Employee" (id, "tenantId", name, "hourlyRateNormal", "hourlyRateSpecial", active, "createdAt", "updatedAt")
    VALUES ('${empId}', '${tenantId}', 'María García', 6400, 11500, 1, '${now}', '${now}')`);

  await exec(`INSERT OR IGNORE INTO "User" (id, "tenantId", username, "passwordHash", role, "employeeId", "createdAt", "updatedAt")
    VALUES ('${empUserId}', '${tenantId}', 'maria', '${empHash}', 'EMPLOYEE', '${empId}', '${now}', '${now}')`);

  console.log("\n✅ Seed completado");
  console.log(`   Tenant:   ${tenantId}`);
  console.log(`   Admin:    admin / admin123`);
  console.log(`   Empleado: maria / emp123`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("🔄 Aplicando schema...");
exec(M1)
  .then(() => {
    console.log("\n✅ Tablas creadas");
    return seed();
  })
  .then(() => {
    console.log("\n🎉 Base de datos lista en Turso");
  })
  .catch((err) => {
    console.error("\n❌", err.message);
    process.exit(1);
  });
