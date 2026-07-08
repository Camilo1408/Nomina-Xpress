/**
 * Volcado (dump) SQL de una base Turso/libsql. SOLO LECTURA: usa únicamente
 * SELECT y PRAGMA; nunca modifica la base de origen. Produce SQL estándar
 * restaurable (schema + datos + índices), envuelto para restauración segura.
 *
 * Credenciales SOLO por variables de entorno (nunca hardcodear tokens):
 *   DUMP_URL    libsql://... de la base a respaldar   (requerido)
 *   DUMP_TOKEN  token de auth de esa base             (requerido para Turso remoto)
 *   DUMP_OUT    ruta del archivo .sql de salida        (o pásala como argv[2])
 *
 * Uso:
 *   DUMP_URL=libsql://... DUMP_TOKEN=... node scripts/db-dump.mjs backup.sql
 */
import { createClient } from "@libsql/client";
import { writeFileSync } from "node:fs";

const url = process.env.DUMP_URL;
const authToken = process.env.DUMP_TOKEN;
const out = process.env.DUMP_OUT || process.argv[2];

if (!url || !out) {
  console.error("Uso: DUMP_URL=<libsql> DUMP_TOKEN=<token> node scripts/db-dump.mjs <archivo-salida.sql>");
  process.exit(1);
}

const db = createClient({ url, authToken });

/** Serializa un valor a un literal SQL seguro. */
function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (v instanceof Uint8Array) {
    let hex = "";
    for (const b of v) hex += b.toString(16).padStart(2, "0");
    return `X'${hex}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  const tablesRes = await db.execute(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' AND name NOT LIKE '_litestream%' ORDER BY name"
  );
  const tables = tablesRes.rows.map((r) => ({ name: String(r.name), sql: String(r.sql) }));

  const lines = [
    `-- Dump de ${url}`,
    `-- Generado ${new Date().toISOString()} por scripts/db-dump.mjs (solo lectura)`,
    "PRAGMA foreign_keys=OFF;",
    "BEGIN TRANSACTION;",
  ];

  let totalRows = 0;
  for (const t of tables) {
    const countRes = await db.execute(`SELECT COUNT(*) AS c FROM "${t.name}"`);
    const count = Number(countRes.rows[0].c);
    totalRows += count;

    lines.push(`\n-- Tabla: ${t.name} (${count} filas)`);
    lines.push(`DROP TABLE IF EXISTS "${t.name}";`);
    lines.push(`${t.sql};`);

    if (count > 0) {
      const rowsRes = await db.execute(`SELECT * FROM "${t.name}"`);
      const cols = rowsRes.columns;
      const colList = cols.map((c) => `"${c}"`).join(", ");
      for (const row of rowsRes.rows) {
        const vals = cols.map((c) => lit(row[c])).join(", ");
        lines.push(`INSERT INTO "${t.name}" (${colList}) VALUES (${vals});`);
      }
    }
  }

  const idxRes = await db.execute(
    "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name"
  );
  lines.push("\n-- Índices");
  for (const r of idxRes.rows) lines.push(`${String(r.sql)};`);

  lines.push("COMMIT;", "PRAGMA foreign_keys=ON;", "");
  writeFileSync(out, lines.join("\n"), "utf8");

  console.error(`Dump OK: ${tables.length} tablas, ${totalRows} filas -> ${out}`);
  await db.close();
}

main().catch((e) => {
  console.error("ERROR en dump:", e);
  process.exit(1);
});
