// Aplica ALTER TABLE Employee ADD COLUMN payType TEXT NOT NULL DEFAULT 'PAYROLL'
// en la base de datos de Turso (producción).
import { config } from "dotenv";
config({ path: ".env.production" });

import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Comprobamos si la columna ya existe (idempotente).
const cols = await client.execute("PRAGMA table_info(Employee);");
const hasPayType = cols.rows.some((r) => r.name === "payType");

if (hasPayType) {
  console.log("ℹ️  La columna payType ya existe en Employee. Nada que hacer.");
} else {
  await client.execute(
    "ALTER TABLE Employee ADD COLUMN payType TEXT NOT NULL DEFAULT 'PAYROLL';"
  );
  console.log("✅ Columna payType agregada a Employee en Turso.");
}

const after = await client.execute("PRAGMA table_info(Employee);");
console.log("Columnas de Employee:", after.rows.map((r) => r.name));
