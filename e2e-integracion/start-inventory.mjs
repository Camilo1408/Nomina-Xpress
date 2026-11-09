// Arranca Inventory Xpress en modo integrado para las pruebas de integración con Nómina.
//
// Lo invoca Playwright (playwright.integracion.config.ts). Toma el código de Inventory de
// INVENTORY_DIR (por defecto, la carpeta hermana `../inventario-restaurante`), que debe
// tener sus dependencias instaladas y un build hecho con las variables de este archivo.
//
// Usa una SQLite efímera propia (e2e-integracion.db dentro de Inventory): nunca toca
// inventario.db ni una base remota.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { INTEGRATION_ENV, INVENTORY_PORT } from "./env.mjs";

const dir = path.resolve(import.meta.dirname, "..", process.env.INVENTORY_DIR ?? "../inventario-restaurante");
if (!existsSync(path.join(dir, ".next", "BUILD_ID"))) {
  console.error(`Falta el build de Inventory en ${dir}. Ver e2e-integracion/README.md.`);
  process.exit(1);
}

const env = {
  ...process.env,
  ...INTEGRATION_ENV.inventory,
  // Definido (aunque vacío) para que Next no cargue el token de un .env.production local.
  TURSO_AUTH_TOKEN: "",
};

for (const suffix of ["", "-journal", "-shm", "-wal"]) {
  rmSync(path.join(dir, `e2e-integracion.db${suffix}`), { force: true });
}

const bin = {
  prisma: path.join(dir, "node_modules/prisma/build/index.js"),
  tsx: path.join(dir, "node_modules/tsx/dist/cli.mjs"),
  next: path.join(dir, "node_modules/next/dist/bin/next"),
};

function run(script, args) {
  const res = spawnSync(process.execPath, [script, ...args], { cwd: dir, env, stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}
run(bin.prisma, ["db", "push"]);
run(bin.tsx, ["prisma/seed.ts"]); // categorías base (Barra, Cocina, Limpieza)

const server = spawn(process.execPath, [bin.next, "start", "-p", INVENTORY_PORT], { cwd: dir, env, stdio: "inherit" });
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
process.on("exit", () => server.kill());
