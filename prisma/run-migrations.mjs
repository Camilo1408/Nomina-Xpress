/**
 * Aplica migraciones de Prisma a Turso/LibSQL usando @libsql/client directamente.
 * Ejecutar con: node prisma/run-migrations.mjs
 * Variables requeridas: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
 */
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const MIGRATIONS_DIR = new URL("./migrations", import.meta.url).pathname;

async function ensureMigrationsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      finished_at DATETIME,
      migration_name TEXT NOT NULL UNIQUE,
      logs TEXT,
      rolled_back_at DATETIME,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function getAppliedMigrations() {
  const result = await db.execute(
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL"
  );
  return new Set(result.rows.map((r) => r.migration_name));
}

async function applyMigration(name, sql) {
  const id = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO _prisma_migrations (id, checksum, migration_name, applied_steps_count) VALUES (?, ?, ?, 0)",
    args: [id, "manual", name],
  });

  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const stmt of statements) {
    await db.execute(stmt);
  }

  await db.execute({
    sql: "UPDATE _prisma_migrations SET finished_at = CURRENT_TIMESTAMP, applied_steps_count = ? WHERE id = ?",
    args: [statements.length, id],
  });
}

async function main() {
  console.log("Conectando a Turso:", process.env.TURSO_DATABASE_URL);
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  console.log("Migraciones ya aplicadas:", applied.size);

  const dirs = readdirSync(MIGRATIONS_DIR)
    .filter((d) => /^\d{14}_/.test(d))
    .sort();

  let pending = 0;
  for (const dir of dirs) {
    if (applied.has(dir)) {
      console.log(`  ✓ ${dir} (ya aplicada)`);
      continue;
    }
    const sqlPath = join(MIGRATIONS_DIR, dir, "migration.sql");
    if (!existsSync(sqlPath)) continue;

    const sql = readFileSync(sqlPath, "utf8");
    console.log(`  → Aplicando ${dir}...`);
    await applyMigration(dir, sql);
    console.log(`  ✓ ${dir} aplicada`);
    pending++;
  }

  if (pending === 0) console.log("No hay migraciones pendientes.");
  else console.log(`\n${pending} migración(es) aplicadas.`);

  await db.close();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
