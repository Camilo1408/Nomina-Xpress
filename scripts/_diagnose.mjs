import { config } from "dotenv";
config({ path: ".env.production" });
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Faltan TURSO_DATABASE_URL / TURSO_AUTH_TOKEN. Definilas en .env.production o pasalas por variables de entorno.");
  process.exit(1);
}

const db = createClient({ url, authToken });

// 1. Ver esquema exacto de todas las tablas
console.log("=== SCHEMA COMPLETO DE LA BD ===\n");
const tables = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
for (const t of tables.rows) {
  const name = t.name;
  if (name.startsWith("_")) continue;
  const info = await db.execute(`PRAGMA table_info("${name}")`);
  console.log(`\n[${name}]`);
  for (const c of info.rows) {
    console.log(`  ${String(c.name).padEnd(22)} ${String(c.type).padEnd(10)} notnull:${c.notnull} default:${c.dflt_value}`);
  }
}

// 2. Ver índices de User (necesita unique en username para prisma findUnique)
console.log("\n=== ÍNDICES DE USER ===\n");
const idx = await db.execute(`PRAGMA index_list("User")`);
for (const i of idx.rows) {
  const idxInfo = await db.execute({ sql: `PRAGMA index_info(?)`, args: [i.name] });
  console.log(`  ${i.unique ? "UNIQUE" : "INDEX "} ${i.name}: ${idxInfo.rows.map(r=>r.name).join(", ")}`);
}

// 3. Simular la query que hace Prisma en authorize (findUnique by username)
console.log("\n=== TEST DE QUERY AUTH ===\n");
try {
  const r = await db.execute({ sql: `SELECT id, username, passwordHash, role, active FROM "User" WHERE username = ?`, args: ["Mantenimiento"] });
  console.log("  findUnique(username): OK →", r.rows[0] ? `encontrado (role: ${r.rows[0].role})` : "no encontrado");
} catch(e) { console.log("  findUnique ERROR:", e.message); }

// 4. Simular la query que hace getEffectivePermissions
console.log("\n=== TEST DE QUERY PERMISSIONS ===\n");
try {
  const r = await db.execute({ sql: `SELECT id, role, customRoleId, active FROM "User" WHERE id = ? AND tenantId = ?`, args: ["test-id", "test-tenant"] });
  console.log("  User query con customRoleId: OK");
} catch(e) { console.log("  User query ERROR:", e.message); }

try {
  const r = await db.execute({ sql: `SELECT permissionKey, granted FROM "UserPermission" WHERE userId = ? AND tenantId = ?`, args: ["test-id", "test-tenant"] });
  console.log("  UserPermission query: OK");
} catch(e) { console.log("  UserPermission query ERROR:", e.message); }

try {
  const r = await db.execute({ sql: `SELECT permissions FROM "CustomRole" WHERE id = ?`, args: ["test-id"] });
  console.log("  CustomRole query: OK");
} catch(e) { console.log("  CustomRole query ERROR:", e.message); }

await db.close();
