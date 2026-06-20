/**
 * Aplica la migración del módulo de propinas a la base de datos Turso en producción.
 * Seguro para ejecutar múltiples veces (idempotente — ignora "already exists").
 *
 * Uso (PowerShell):
 *   $env:TURSO_DATABASE_URL="libsql://your-db.turso.io"
 *   $env:TURSO_AUTH_TOKEN="eyJ..."
 *   node prisma/turso-migrate-tips.mjs
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
      msg.includes("table") && msg.includes("exists")
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
  console.log("🔄  Aplicando migración: módulo de propinas\n");

  // ── 1. Agregar columna tipPercent a Employee ──────────────────────────────
  await exec(
    `ALTER TABLE "Employee" ADD COLUMN "tipPercent" REAL NOT NULL DEFAULT 100`,
    'ALTER Employee ADD tipPercent'
  );

  // ── 2. Crear tabla TipEntry ───────────────────────────────────────────────
  await exec(`
    CREATE TABLE "TipEntry" (
      "id"          TEXT     NOT NULL PRIMARY KEY,
      "tenantId"    TEXT     NOT NULL,
      "date"        TEXT     NOT NULL,
      "totalAmount" REAL     NOT NULL,
      "menaje"      REAL     NOT NULL,
      "netAmount"   REAL     NOT NULL,
      "periodStart" TEXT     NOT NULL,
      "periodEnd"   TEXT     NOT NULL,
      "notes"       TEXT,
      "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"   DATETIME NOT NULL,
      CONSTRAINT "TipEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `, 'CREATE TABLE TipEntry');

  // ── 3. Crear tabla TipDistribution ───────────────────────────────────────
  await exec(`
    CREATE TABLE "TipDistribution" (
      "id"             TEXT     NOT NULL PRIMARY KEY,
      "tenantId"       TEXT     NOT NULL,
      "tipEntryId"     TEXT     NOT NULL,
      "employeeId"     TEXT     NOT NULL,
      "hoursWorked"    REAL     NOT NULL,
      "tipPercent"     REAL     NOT NULL,
      "effectiveHours" REAL     NOT NULL,
      "amount"         REAL     NOT NULL,
      "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TipDistribution_tipEntryId_fkey" FOREIGN KEY ("tipEntryId") REFERENCES "TipEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "TipDistribution_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `, 'CREATE TABLE TipDistribution');

  // ── 4. Índices TipEntry ───────────────────────────────────────────────────
  await exec(
    `CREATE INDEX "TipEntry_tenantId_idx" ON "TipEntry"("tenantId")`,
    'INDEX TipEntry_tenantId_idx'
  );
  await exec(
    `CREATE INDEX "TipEntry_tenantId_periodStart_periodEnd_idx" ON "TipEntry"("tenantId", "periodStart", "periodEnd")`,
    'INDEX TipEntry_period_idx'
  );
  await exec(
    `CREATE UNIQUE INDEX "TipEntry_tenantId_date_key" ON "TipEntry"("tenantId", "date")`,
    'UNIQUE INDEX TipEntry_tenantId_date_key'
  );

  // ── 5. Índices TipDistribution ────────────────────────────────────────────
  await exec(
    `CREATE INDEX "TipDistribution_tenantId_employeeId_idx" ON "TipDistribution"("tenantId", "employeeId")`,
    'INDEX TipDistribution_tenantId_employeeId_idx'
  );
  await exec(
    `CREATE INDEX "TipDistribution_tipEntryId_idx" ON "TipDistribution"("tipEntryId")`,
    'INDEX TipDistribution_tipEntryId_idx'
  );

  console.log("\n🎉  Migración completada — módulo de propinas listo en producción");
}

migrate().catch((err) => {
  console.error("\n❌ ", err.message);
  process.exit(1);
});
