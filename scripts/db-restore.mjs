/**
 * Restaura un dump .sql (generado por scripts/db-dump.mjs) en una base
 * Turso/libsql. ⚠️ DESTRUCTIVO: el dump ejecuta DROP TABLE IF EXISTS + CREATE,
 * así que SOBRESCRIBE la base destino. Restaura preferiblemente en una base
 * NUEVA o temporal, verifica, y solo entonces apunta el cliente a ella.
 *
 * Credenciales SOLO por variables de entorno (nunca hardcodear tokens):
 *   RESTORE_URL      libsql://... destino                 (requerido)
 *   RESTORE_TOKEN    token de auth del destino
 *   RESTORE_CONFIRM  debe valer "si" (guarda anti-accidentes)
 *
 * Uso:
 *   RESTORE_URL=libsql://... RESTORE_TOKEN=... RESTORE_CONFIRM=si \
 *     node scripts/db-restore.mjs backup-cliente-YYYY-MM-DD.sql
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const url = process.env.RESTORE_URL;
const authToken = process.env.RESTORE_TOKEN;
const file = process.argv[2];

if (!url || !file) {
  console.error("Uso: RESTORE_URL=<libsql> RESTORE_TOKEN=<token> RESTORE_CONFIRM=si node scripts/db-restore.mjs <dump.sql>");
  process.exit(1);
}
if (process.env.RESTORE_CONFIRM !== "si") {
  console.error("Abortado: operación destructiva. Define RESTORE_CONFIRM=si para confirmar.");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const db = createClient({ url, authToken });

async function main() {
  await db.executeMultiple(sql);
  const res = await db.execute(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%'"
  );
  console.error(`Restauración OK en ${url}: ${Number(res.rows[0].c)} tablas.`);
  await db.close();
}

main().catch((e) => { console.error("ERROR en restauración:", e); process.exit(1); });
