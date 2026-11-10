// Variables de las dos aplicaciones para las pruebas de integración. Una sola fuente:
// las usan el build (varias son NEXT_PUBLIC_*, que quedan fijas al compilar), el
// arranque de cada servidor y la configuración de Playwright.
//
// Sin secretos: el NEXTAUTH_SECRET es de relleno y solo existe en estas pruebas. Lo que
// importa es que sea EL MISMO en las dos aplicaciones, como en producción.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const NOMINA_PORT = "3100";
export const INVENTORY_PORT = "3101";
export const NOMINA_URL = `http://localhost:${NOMINA_PORT}`;
export const INVENTORY_URL = `http://localhost:${INVENTORY_PORT}`;

const SECRET = "integracion-only-not-a-real-secret-000000";

export const INTEGRATION_ENV = {
  nomina: {
    TURSO_DATABASE_URL: "file:./e2e.db",
    NEXTAUTH_SECRET: SECRET,
    E2E_NEXTAUTH_SECRET: SECRET, // e2e/start-server.mjs usa este en vez del suyo
    NEXTAUTH_URL: NOMINA_URL,
    AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_INVENTARIO_APP_URL: INVENTORY_URL,
    NEXT_TELEMETRY_DISABLED: "1",
  },
  inventory: {
    AUTH_MODE: "integrated",
    TURSO_DATABASE_URL: "file:./e2e-integracion.db",
    NEXTAUTH_SECRET: SECRET,
    NEXTAUTH_URL: INVENTORY_URL,
    AUTH_TRUST_HOST: "true",
    NOMINA_APP_URL: NOMINA_URL,
    NEXT_PUBLIC_NOMINA_APP_URL: NOMINA_URL,
    NEXT_PUBLIC_FEATURE_COCKTAILS: "true",
    NEXT_PUBLIC_FEATURE_DAILY_INV: "true",
    NEXT_TELEMETRY_DISABLED: "1",
  },
};

// `node e2e-integracion/env.mjs nomina|inventory` imprime las variables como líneas
// CLAVE=valor, para cargarlas en el paso de build (local o CI).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const vars = INTEGRATION_ENV[process.argv[2]];
  if (!vars) {
    console.error("Uso: node e2e-integracion/env.mjs nomina|inventory");
    process.exit(1);
  }
  for (const [k, v] of Object.entries(vars)) console.log(`${k}=${v}`);
}
