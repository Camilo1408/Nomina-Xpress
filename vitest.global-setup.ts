// Prepara la base SQLite de las pruebas de integración (archivos *.db.test.ts).
//
// Corre UNA vez antes de toda la suite: aplica el schema de Prisma a una base plantilla
// vacía. Cada archivo de prueba trabaja sobre su propia copia (ver src/test/db.ts), así
// las pruebas corren en paralelo sin pisarse y nunca tocan `dev.db` ni una base remota.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

export const TEST_DB_DIR = path.resolve(__dirname, "node_modules/.cache/nx-test");
export const TEMPLATE_DB = path.join(TEST_DB_DIR, "template.db");

export default function setup() {
  // Las bases de la corrida anterior se borran aquí y no al terminar: en Windows el
  // proceso de pruebas aún las tiene abiertas cuando Vitest cierra.
  try {
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  } catch {
    // Un archivo bloqueado de otra corrida no estorba: cada prueba usa un nombre nuevo.
  }
  mkdirSync(TEST_DB_DIR, { recursive: true });
  rmSync(TEMPLATE_DB, { force: true });

  // Ruta relativa con "/" para que libSQL y la CLI de Prisma la lean igual en Windows y Linux.
  const url = "file:./" + path.relative(__dirname, TEMPLATE_DB).split(path.sep).join("/");
  execFileSync(process.execPath, [path.resolve(__dirname, "node_modules/prisma/build/index.js"), "db", "push"], {
    cwd: __dirname,
    stdio: "pipe",
    // Sin TURSO_AUTH_TOKEN: aunque el entorno tuviera uno, aquí solo existe el archivo local.
    env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: "" },
  });
}
