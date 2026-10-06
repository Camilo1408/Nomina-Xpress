/**
 * ROLLBACK del módulo de concursos e incentivos.
 *
 * Elimina las 6 tablas del módulo. NO toca ninguna tabla existente del sistema.
 *
 * La columna TipEntry.contestReserved se DEJA en su sitio a propósito:
 *   - SQLite no soporta DROP COLUMN sin recrear la tabla, y recrear TipEntry en
 *     producción es mucho más arriesgado que dejar una columna sin usar.
 *   - Con el módulo eliminado, la columna queda en 0 para todas las filas y nadie
 *     la lee, así que es inofensiva.
 *
 * ATENCIÓN: esto borra concursos, reservas, ganadores y bonos. Las propinas y sus
 * distribuciones NO se recalculan: quedan tal como estaban con los descuentos ya
 * aplicados. Si hace falta devolver ese dinero, cancelar los concursos DESDE LA
 * APLICACIÓN antes de ejecutar este rollback.
 *
 * Uso:
 *   node prisma/turso-rollback-concursos.mjs --confirmar
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

if (!process.argv.includes("--confirmar")) {
  console.error("Este script BORRA las tablas del módulo de concursos.");
  console.error(`Base de datos: ${url}`);
  console.error("\nSi es lo que quieres, vuelve a ejecutarlo con --confirmar");
  process.exit(1);
}

const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

// Orden inverso a la creación, respetando las claves foráneas.
const DROP_ORDER = [
  "ContestBonusPayment",
  "ContestBonus",
  "ContestTipReserve",
  "ContestItemResult",
  "ContestItem",
  "Contest",
];

async function tableExists(table) {
  const res = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    args: [table],
  });
  return res.rows.length > 0;
}

async function main() {
  console.log(`Base de datos: ${url}`);
  console.log("Rollback: concursos e incentivos\n");

  // Informe de lo que se va a perder, antes de borrar.
  for (const t of DROP_ORDER) {
    if (await tableExists(t)) {
      const res = await db.execute(`SELECT COUNT(*) AS n FROM "${t}"`);
      console.log(`  ${t}: ${res.rows[0].n} registro(s) se eliminarán`);
    }
  }

  console.log("");
  for (const t of DROP_ORDER) {
    await db.execute(`DROP TABLE IF EXISTS "${t}"`);
    console.log(`  − ${t} eliminada`);
  }

  console.log("\nVerificación:");
  for (const t of DROP_ORDER) {
    const gone = !(await tableExists(t));
    console.log(`  ${gone ? "✓" : "✗"} ${t} eliminada`);
    if (!gone) process.exitCode = 1;
  }

  console.log(
    "\nTipEntry.contestReserved se conserva (SQLite no soporta DROP COLUMN); es inofensiva."
  );
  console.log("Las propinas y sus distribuciones no fueron modificadas.");
  await db.close();
}

main().catch(async (err) => {
  console.error("\nERROR en el rollback:", err.message);
  await db.close().catch(() => {});
  process.exit(1);
});
