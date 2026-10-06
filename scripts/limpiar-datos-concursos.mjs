/**
 * Elimina TODOS los datos de concursos y devuelve al personal el dinero reservado.
 *
 * El dinero se devuelve por el camino real de la aplicación: tras borrar los
 * concursos se hace un PUT sobre cada TipEntry afectado con su MISMO importe, lo
 * que dispara el recálculo interno. Al no quedar concursos que apliquen, el neto
 * vuelve a ser total − menaje y las distribuciones se rehacen completas.
 *
 * Borrar las filas sin recalcular dejaría contestReserved > 0 y el reparto
 * mermado de forma permanente.
 *
 * Requiere el dev server corriendo.
 * Uso: node scripts/limpiar-datos-concursos.mjs --confirmar
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { existsSync } from "fs";

for (const f of [".env.local", ".env"]) if (existsSync(f)) config({ path: f, override: false, quiet: true });

if (!process.argv.includes("--confirmar")) {
  console.error("Esto BORRA todos los concursos. Reejecuta con --confirmar");
  process.exit(1);
}

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const q = async (sql, args = []) => (await db.execute({ sql, args })).rows;

function parseCookies(res, jar) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";"); const i = p.indexOf("=");
    jar[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
}
const cookieHeader = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");

async function login(username, password) {
  const jar = {};
  const cr = await fetch(`${BASE}/api/auth/csrf`); parseCookies(cr, jar);
  const { csrfToken } = await cr.json();
  const lr = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(jar) },
    body: new URLSearchParams({ csrfToken, username, password, redirect: "false", json: "true" }).toString(),
    redirect: "manual",
  });
  parseCookies(lr, jar);
  const s = await (await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookieHeader(jar) } })).json();
  if (!s?.user) throw new Error("No se pudo iniciar sesión");
  return jar;
}

const jar = await login("proprietario", "proprietario123");

// 1. Fotografía previa
const afectados = await q(`
  SELECT DISTINCT t.id, t.date, t.totalAmount, t.menaje, t.contestReserved, t.netAmount, t.notes
  FROM TipEntry t
  WHERE t.contestReserved != 0 OR t.id IN (SELECT tipEntryId FROM ContestTipReserve)
  ORDER BY t.date`);

console.log(`Días de propinas con reserva de concurso: ${afectados.length}`);
for (const d of afectados)
  console.log(`  ${d.date}  total=${d.totalAmount}  menaje=${d.menaje}  reservado=${d.contestReserved}  neto=${d.netAmount}`);
console.log(`\nDinero que volverá al personal: ${afectados.reduce((s, d) => s + Number(d.contestReserved), 0)}\n`);

// 2. Borrado en cascada
const TABLAS = ["Contest","ContestItem","ContestItemResult","ContestTipReserve","ContestBonus","ContestBonusPayment"];
const antes = {};
for (const t of TABLAS) antes[t] = Number((await q(`SELECT COUNT(*) n FROM ${t}`))[0].n);
await db.execute(`DELETE FROM Contest`);

console.log("Borrado:");
for (const t of TABLAS) {
  const n = Number((await q(`SELECT COUNT(*) n FROM ${t}`))[0].n);
  console.log(`  ${t.padEnd(22)} ${antes[t]} -> ${n}`);
  if (n !== 0) process.exitCode = 1;
}

// 3. Recálculo por el camino real de la app
console.log("\nRecalculando el reparto (PUT con el mismo importe):");
for (const d of afectados) {
  const res = await fetch(`${BASE}/api/admin/tips/${d.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(jar) },
    body: JSON.stringify({ totalAmount: Number(d.totalAmount), notes: d.notes ?? undefined }),
  });
  if (!res.ok) { console.log(`  ${d.date}  ERROR ${res.status}`); process.exitCode = 1; continue; }

  const [f] = await q(`SELECT totalAmount, menaje, contestReserved, netAmount FROM TipEntry WHERE id = ?`, [d.id]);
  const [{ s: repartido }] = await q(`SELECT COALESCE(SUM(amount),0) s FROM TipDistribution WHERE tipEntryId = ?`, [d.id]);
  const cuadra = Number(f.totalAmount) === Number(f.menaje) + Number(f.contestReserved) + Number(f.netAmount);
  console.log(
    `  ${d.date}  neto ${d.netAmount} -> ${f.netAmount}  reservado ${d.contestReserved} -> ${f.contestReserved}` +
    `  repartido=${repartido}  invariante=${cuadra ? "OK" : "ROTA"}`);
  if (!cuadra) process.exitCode = 1;
}

const quedan = Number((await q(`SELECT COUNT(*) n FROM TipEntry WHERE contestReserved != 0`))[0].n);
console.log(`\nTipEntry con contestReserved != 0: ${quedan} (esperado 0)`);
if (quedan !== 0) process.exitCode = 1;
await db.close();
