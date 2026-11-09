// Arranca la app para las pruebas E2E contra una base SQLite efímera (CP-40, G10).
//
// Lo invoca Playwright (`webServer` en playwright.config.ts). Pasos:
//   1. Borra y recrea e2e.db con el schema actual (`prisma db push`).
//   2. La siembra con los usuarios y datos de prueba públicos (prisma/seed-local.ts).
//   3. Sirve el build de producción (`next start`), que es lo que llega a los clientes:
//      así las pruebas ven la CSP y las cabeceras reales.
//
// Requiere un build previo (`npm run build`). Nunca toca dev.db ni una base remota:
// TURSO_DATABASE_URL se fija aquí y la semilla se niega a correr si no es `file:`.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const PORT = process.env.E2E_PORT ?? "3100";

const env = {
  ...process.env,
  TURSO_DATABASE_URL: "file:./e2e.db",
  // Definido (aunque vacío) para que Next no cargue el token de un .env.production local.
  TURSO_AUTH_TOKEN: "",
  NEXTAUTH_SECRET: "e2e-only-not-a-real-secret-0000000000000",
  NEXTAUTH_URL: `http://localhost:${PORT}`,
  AUTH_TRUST_HOST: "true",
  NEXT_TELEMETRY_DISABLED: "1",
};

if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
  console.error("Falta el build de producción. Corre `npm run build` antes de `npm run test:e2e`.");
  process.exit(1);
}

for (const suffix of ["", "-journal", "-shm", "-wal"]) {
  rmSync(path.join(root, `e2e.db${suffix}`), { force: true });
}

// Se ejecutan los binarios de node_modules con el mismo Node, sin shell ni `npx`: así
// Playwright puede detener el servidor al terminar (en Windows un shell intermedio lo
// dejaba vivo, con la base abierta).
const bin = {
  prisma: path.join(root, "node_modules/prisma/build/index.js"),
  tsx: path.join(root, "node_modules/tsx/dist/cli.mjs"),
  next: path.join(root, "node_modules/next/dist/bin/next"),
};

function run(script, args) {
  const res = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}
run(bin.prisma, ["db", "push"]);
run(bin.tsx, ["prisma/seed-local.ts"]);

const server = spawn(process.execPath, [bin.next, "start", "-p", PORT], { cwd: root, env, stdio: "inherit" });
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
process.on("exit", () => server.kill());
