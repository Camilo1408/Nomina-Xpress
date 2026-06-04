/**
 * Applies the full schema + seed data to a Turso database via its HTTP API.
 * No extra npm packages needed beyond bcryptjs (already in dependencies).
 *
 * Usage (PowerShell):
 *   $env:TURSO_DATABASE_URL="libsql://your-db.turso.io"
 *   $env:TURSO_AUTH_TOKEN="eyJ..."
 *   node prisma/turso-setup.mjs
 */

const DB_URL = (process.env.TURSO_DATABASE_URL ?? "").replace("libsql://", "https://");
const TOKEN  = process.env.TURSO_AUTH_TOKEN ?? "";

if (!DB_URL || !TOKEN) {
  console.error("❌  Falta TURSO_DATABASE_URL o TURSO_AUTH_TOKEN");
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
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
        process.stdout.write("⚠");
      } else {
        throw new Error(`SQL error: ${msg}\n→ ${clean.slice(0, 120)}`);
      }
    } else {
      process.stdout.write(".");
    }
  }
}

// ── Schema completo (sincronizado con schema.prisma actual) ───────────────────

const SCHEMA = `
CREATE TABLE "Tenant" (
  "id"             TEXT    NOT NULL PRIMARY KEY,
  "name"           TEXT    NOT NULL,
  "logoUrl"        TEXT,
  "primaryColor"   TEXT    NOT NULL DEFAULT '#C1643F',
  "secondaryColor" TEXT    NOT NULL DEFAULT '#8B6355',
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      DATETIME NOT NULL
);

CREATE TABLE "Employee" (
  "id"                TEXT     NOT NULL PRIMARY KEY,
  "tenantId"          TEXT     NOT NULL,
  "name"              TEXT     NOT NULL,
  "documentId"        TEXT,
  "phone"             TEXT,
  "hourlyRateNormal"  REAL     NOT NULL DEFAULT 6400,
  "hourlyRateSpecial" REAL     NOT NULL DEFAULT 11500,
  "active"            BOOLEAN  NOT NULL DEFAULT true,
  "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         DATETIME NOT NULL,
  CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "User" (
  "id"              TEXT     NOT NULL PRIMARY KEY,
  "tenantId"        TEXT     NOT NULL,
  "username"        TEXT     NOT NULL,
  "passwordHash"    TEXT     NOT NULL,
  "role"            TEXT     NOT NULL DEFAULT 'EMPLOYEE',
  "inventoryAccess" BOOLEAN  NOT NULL DEFAULT false,
  "employeeId"      TEXT,
  "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       DATETIME NOT NULL,
  CONSTRAINT "User_tenantId_fkey"   FOREIGN KEY ("tenantId")   REFERENCES "Tenant"   ("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "TimeEntry" (
  "id"         TEXT     NOT NULL PRIMARY KEY,
  "tenantId"   TEXT     NOT NULL,
  "employeeId" TEXT     NOT NULL,
  "date"       TEXT     NOT NULL,
  "checkIn"    DATETIME NOT NULL,
  "checkOut"   DATETIME,
  "checkIn2"   DATETIME,
  "checkOut2"  DATETIME,
  "isSpecial"  BOOLEAN  NOT NULL DEFAULT false,
  "notes"      TEXT,
  "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  DATETIME NOT NULL,
  CONSTRAINT "TimeEntry_tenantId_fkey"   FOREIGN KEY ("tenantId")   REFERENCES "Tenant"   ("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Schedule" (
  "id"        TEXT     NOT NULL PRIMARY KEY,
  "tenantId"  TEXT     NOT NULL,
  "name"      TEXT     NOT NULL,
  "weekStart" TEXT     NOT NULL,
  "published" BOOLEAN  NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Schedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ScheduleShift" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "scheduleId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date"       TEXT NOT NULL,
  "startTime"  TEXT NOT NULL,
  "endTime"    TEXT NOT NULL,
  "startTime2" TEXT,
  "endTime2"   TEXT,
  CONSTRAINT "ScheduleShift_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "ScheduleShift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PayAdjustment" (
  "id"          TEXT     NOT NULL PRIMARY KEY,
  "tenantId"    TEXT     NOT NULL,
  "employeeId"  TEXT     NOT NULL,
  "type"        TEXT     NOT NULL,
  "amount"      REAL     NOT NULL,
  "description" TEXT     NOT NULL,
  "periodStart" TEXT     NOT NULL,
  "periodEnd"   TEXT     NOT NULL,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayAdjustment_tenantId_fkey"   FOREIGN KEY ("tenantId")   REFERENCES "Tenant"   ("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "PayAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PushSubscription" (
  "id"        TEXT     NOT NULL PRIMARY KEY,
  "tenantId"  TEXT     NOT NULL,
  "userId"    TEXT     NOT NULL,
  "endpoint"  TEXT     NOT NULL,
  "p256dh"    TEXT     NOT NULL,
  "auth"      TEXT     NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PushSubscription_userId_fkey"   FOREIGN KEY ("userId")   REFERENCES "User"   ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "User_username_key"            ON "User"("username");
CREATE UNIQUE INDEX "User_employeeId_key"           ON "User"("employeeId");
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

CREATE INDEX "User_tenantId_idx"                     ON "User"("tenantId");
CREATE INDEX "Employee_tenantId_idx"                  ON "Employee"("tenantId");
CREATE INDEX "TimeEntry_tenantId_employeeId_idx"      ON "TimeEntry"("tenantId", "employeeId");
CREATE INDEX "TimeEntry_tenantId_date_idx"            ON "TimeEntry"("tenantId", "date");
CREATE INDEX "Schedule_tenantId_idx"                  ON "Schedule"("tenantId");
CREATE INDEX "ScheduleShift_scheduleId_idx"           ON "ScheduleShift"("scheduleId");
CREATE INDEX "ScheduleShift_employeeId_idx"           ON "ScheduleShift"("employeeId");
CREATE INDEX "PayAdjustment_tenantId_employeeId_idx"  ON "PayAdjustment"("tenantId", "employeeId");
CREATE INDEX "PushSubscription_tenantId_idx"          ON "PushSubscription"("tenantId");
CREATE INDEX "PushSubscription_userId_idx"            ON "PushSubscription"("userId")
`;

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  const { randomUUID } = await import("crypto");
  const bcrypt = await import("bcryptjs").then((m) => m.default ?? m);

  const now = new Date().toISOString();

  // ── Tenant ──────────────────────────────────────────────────────────────
  const tenantId = randomUUID();
  await exec(
    `INSERT OR IGNORE INTO "Tenant" (id, name, "primaryColor", "secondaryColor", "createdAt", "updatedAt")
     VALUES ('${tenantId}', 'Cucina dei Fiori', '#C1643F', '#8B6355', '${now}', '${now}')`
  );
  console.log(`\n   Tenant: Cucina dei Fiori (${tenantId})`);

  // ── Helpers ─────────────────────────────────────────────────────────────
  async function createEmployee(name) {
    const id = randomUUID();
    await exec(
      `INSERT OR IGNORE INTO "Employee"
         (id, "tenantId", name, "hourlyRateNormal", "hourlyRateSpecial", active, "createdAt", "updatedAt")
       VALUES ('${id}', '${tenantId}', '${name}', 6400, 11500, 1, '${now}', '${now}')`
    );
    return id;
  }

  async function createUser({ username, password, role, inventoryAccess = false, employeeId = null }) {
    const id   = randomUUID();
    const hash = await bcrypt.hash(password, 12);
    const empVal = employeeId ? `'${employeeId}'` : "NULL";
    await exec(
      `INSERT OR IGNORE INTO "User"
         (id, "tenantId", username, "passwordHash", role, "inventoryAccess", "employeeId", "createdAt", "updatedAt")
       VALUES ('${id}', '${tenantId}', '${username}', '${hash}', '${role}', ${inventoryAccess ? 1 : 0}, ${empVal}, '${now}', '${now}')`
    );
    return id;
  }

  // ── SUPERADMINs (sin registro de empleado — son administradores del sistema) ─
  await createUser({ username: "SadminJavier", password: "Javier123",   role: "SUPERADMIN" });
  await createUser({ username: "SadminMajo",   password: "Majo123",     role: "SUPERADMIN" });

  // ── ADMINs con registro de empleado ─────────────────────────────────────
  const empAdminMajo  = await createEmployee("Majo (Admin)");
  const empAdminValen = await createEmployee("Valentina (Admin)");
  await createUser({ username: "AdminMajo",  password: "AdminMajo123", role: "ADMIN", employeeId: empAdminMajo  });
  await createUser({ username: "AdminValen", password: "Valen123",     role: "ADMIN", employeeId: empAdminValen });

  // ── EMPLEADOs ────────────────────────────────────────────────────────────
  const empCesar   = await createEmployee("César H");
  const empVanessa = await createEmployee("Vanessa");
  await createUser({ username: "CesarH",  password: "CesarH123",  role: "EMPLOYEE", inventoryAccess: true,  employeeId: empCesar   });
  await createUser({ username: "Vanessa", password: "Vanessa123", role: "EMPLOYEE", inventoryAccess: false, employeeId: empVanessa });

  console.log("\n   Usuarios creados:");
  console.log("   ┌─────────────────┬─────────────────┬────────────────────────┐");
  console.log("   │ Usuario         │ Contraseña      │ Rol / Acceso           │");
  console.log("   ├─────────────────┼─────────────────┼────────────────────────┤");
  console.log("   │ SadminJavier    │ Javier123       │ SUPERADMIN             │");
  console.log("   │ SadminMajo      │ Majo123         │ SUPERADMIN             │");
  console.log("   │ AdminMajo       │ AdminMajo123    │ ADMIN + empleado       │");
  console.log("   │ AdminValen      │ Valen123        │ ADMIN + empleado       │");
  console.log("   │ CesarH          │ CesarH123       │ EMPLOYEE + inventario  │");
  console.log("   │ Vanessa         │ Vanessa123      │ EMPLOYEE               │");
  console.log("   └─────────────────┴─────────────────┴────────────────────────┘");
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log("🔄  Creando tablas...");
exec(SCHEMA)
  .then(async () => {
    console.log("\n✅  Schema aplicado");
    console.log("\n🌱  Insertando usuarios...");
    await seed();
    console.log("\n🎉  Base de datos lista en Turso");
  })
  .catch((err) => {
    console.error("\n❌ ", err.message);
    process.exit(1);
  });
