/**
 * Aplica la migración de los módulos de BONOS y DESCUENTOS a la base de datos
 * Turso en producción. Seguro para ejecutar múltiples veces (idempotente).
 *
 * Uso (PowerShell):
 *   $env:TURSO_DATABASE_URL="libsql://your-db.turso.io"
 *   $env:TURSO_AUTH_TOKEN="eyJ..."
 *   node prisma/turso-migrate-bonos-descuentos.mjs
 */

const DB_URL = (process.env.TURSO_DATABASE_URL ?? "").replace("libsql://", "https://");
const TOKEN  = process.env.TURSO_AUTH_TOKEN ?? "";

if (!DB_URL || !TOKEN) {
  console.error("❌  Falta TURSO_DATABASE_URL o TURSO_AUTH_TOKEN");
  process.exit(1);
}

async function exec(sql, label) {
  const clean = sql.replace(/;$/, "").trim();
  if (!clean) return;

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
    if (
      msg.includes("already exists") ||
      msg.includes("duplicate column") ||
      (msg.includes("table") && msg.includes("exists"))
    ) {
      console.log(`  ⚠️  ${label} — ya existe, omitiendo`);
    } else {
      throw new Error(`SQL error en "${label}": ${msg}\n→ ${clean.slice(0, 200)}`);
    }
  } else {
    console.log(`  ✅  ${label}`);
  }
}

async function migrate() {
  console.log("🔄  Aplicando migración: módulos de bonos y descuentos\n");

  // ── BONOS ─────────────────────────────────────────────────────────────────
  await exec(`
    CREATE TABLE "Bonus" (
      "id"             TEXT     NOT NULL PRIMARY KEY,
      "tenantId"       TEXT     NOT NULL,
      "name"           TEXT     NOT NULL,
      "description"    TEXT,
      "valueType"      TEXT     NOT NULL DEFAULT 'STANDARD',
      "amount"         REAL     NOT NULL DEFAULT 0,
      "assignmentType" TEXT     NOT NULL DEFAULT 'ALL',
      "frequency"      TEXT     NOT NULL DEFAULT 'BIWEEKLY',
      "monthlyMode"    TEXT,
      "active"         BOOLEAN  NOT NULL DEFAULT true,
      "createdById"    TEXT,
      "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"      DATETIME NOT NULL,
      CONSTRAINT "Bonus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `, 'CREATE TABLE Bonus');
  await exec(`CREATE INDEX "Bonus_tenantId_idx" ON "Bonus"("tenantId")`, 'INDEX Bonus_tenantId_idx');
  await exec(`CREATE INDEX "Bonus_tenantId_active_idx" ON "Bonus"("tenantId", "active")`, 'INDEX Bonus_tenantId_active_idx');

  await exec(`
    CREATE TABLE "BonusAssignment" (
      "id"         TEXT     NOT NULL PRIMARY KEY,
      "tenantId"   TEXT     NOT NULL,
      "bonusId"    TEXT     NOT NULL,
      "employeeId" TEXT     NOT NULL,
      "amount"     REAL,
      "active"     BOOLEAN  NOT NULL DEFAULT true,
      "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"  DATETIME NOT NULL,
      CONSTRAINT "BonusAssignment_tenantId_fkey"   FOREIGN KEY ("tenantId")   REFERENCES "Tenant" ("id")   ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "BonusAssignment_bonusId_fkey"    FOREIGN KEY ("bonusId")    REFERENCES "Bonus" ("id")    ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "BonusAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `, 'CREATE TABLE BonusAssignment');
  await exec(`CREATE UNIQUE INDEX "BonusAssignment_bonusId_employeeId_key" ON "BonusAssignment"("bonusId", "employeeId")`, 'UNIQUE INDEX BonusAssignment_bonusId_employeeId_key');
  await exec(`CREATE INDEX "BonusAssignment_tenantId_idx" ON "BonusAssignment"("tenantId")`, 'INDEX BonusAssignment_tenantId_idx');
  await exec(`CREATE INDEX "BonusAssignment_bonusId_idx" ON "BonusAssignment"("bonusId")`, 'INDEX BonusAssignment_bonusId_idx');
  await exec(`CREATE INDEX "BonusAssignment_employeeId_idx" ON "BonusAssignment"("employeeId")`, 'INDEX BonusAssignment_employeeId_idx');

  // ── DESCUENTOS ──────────────────────────────────────────────────────────────
  await exec(`
    CREATE TABLE "Discount" (
      "id"             TEXT     NOT NULL PRIMARY KEY,
      "tenantId"       TEXT     NOT NULL,
      "name"           TEXT     NOT NULL,
      "description"    TEXT,
      "valueType"      TEXT     NOT NULL DEFAULT 'STANDARD',
      "amount"         REAL     NOT NULL DEFAULT 0,
      "assignmentType" TEXT     NOT NULL DEFAULT 'ALL',
      "frequency"      TEXT     NOT NULL DEFAULT 'BIWEEKLY',
      "monthlyMode"    TEXT,
      "active"         BOOLEAN  NOT NULL DEFAULT true,
      "createdById"    TEXT,
      "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"      DATETIME NOT NULL,
      CONSTRAINT "Discount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `, 'CREATE TABLE Discount');
  await exec(`CREATE INDEX "Discount_tenantId_idx" ON "Discount"("tenantId")`, 'INDEX Discount_tenantId_idx');
  await exec(`CREATE INDEX "Discount_tenantId_active_idx" ON "Discount"("tenantId", "active")`, 'INDEX Discount_tenantId_active_idx');

  await exec(`
    CREATE TABLE "DiscountAssignment" (
      "id"         TEXT     NOT NULL PRIMARY KEY,
      "tenantId"   TEXT     NOT NULL,
      "discountId" TEXT     NOT NULL,
      "employeeId" TEXT     NOT NULL,
      "amount"     REAL,
      "active"     BOOLEAN  NOT NULL DEFAULT true,
      "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"  DATETIME NOT NULL,
      CONSTRAINT "DiscountAssignment_tenantId_fkey"   FOREIGN KEY ("tenantId")   REFERENCES "Tenant" ("id")    ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DiscountAssignment_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount" ("id")  ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DiscountAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id")  ON DELETE CASCADE ON UPDATE CASCADE
    )
  `, 'CREATE TABLE DiscountAssignment');
  await exec(`CREATE UNIQUE INDEX "DiscountAssignment_discountId_employeeId_key" ON "DiscountAssignment"("discountId", "employeeId")`, 'UNIQUE INDEX DiscountAssignment_discountId_employeeId_key');
  await exec(`CREATE INDEX "DiscountAssignment_tenantId_idx" ON "DiscountAssignment"("tenantId")`, 'INDEX DiscountAssignment_tenantId_idx');
  await exec(`CREATE INDEX "DiscountAssignment_discountId_idx" ON "DiscountAssignment"("discountId")`, 'INDEX DiscountAssignment_discountId_idx');
  await exec(`CREATE INDEX "DiscountAssignment_employeeId_idx" ON "DiscountAssignment"("employeeId")`, 'INDEX DiscountAssignment_employeeId_idx');

  console.log("\n🎉  Migración completada — bonos y descuentos listos en producción");
}

migrate().catch((err) => {
  console.error("\n❌ ", err.message);
  process.exit(1);
});
