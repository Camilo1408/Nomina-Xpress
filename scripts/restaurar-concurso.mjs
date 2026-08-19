/**
 * Revierte los efectos de una sonda de diagnóstico sobre el concurso local:
 *   - borra el ítem "PRUEBA_X" que creó,
 *   - devuelve "Venta de Cervezas" de DESIERTO a PENDIENTE,
 *   - y recalcula los días afectados para que sus reservas vuelvan.
 *
 * El recálculo se dispara con un PUT sobre cada TipEntry usando su MISMO importe,
 * que es el camino real de la aplicación: resolveContestDeductionsForDate vuelve a
 * incluir el ítem (PENDIENTE en un concurso ACTIVO) y la reserva se recrea.
 *
 * Uso: node scripts/restaurar-concurso.mjs
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { existsSync } from "fs";

for (const f of [".env.local", ".env"]) if (existsSync(f)) config({ path: f, override: false, quiet: true });

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const sql = async (s, args = []) => (await db.execute({ sql: s, args })).rows;
const money = (n) => new Intl.NumberFormat("es-CO").format(Math.round(n));

function pc(res, jar) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";"); const i = p.indexOf("=");
    jar[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
}
const ch = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");
const jar = {};
const cr = await fetch(`${BASE}/api/auth/csrf`); pc(cr, jar);
const { csrfToken } = await cr.json();
const lr = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: ch(jar) },
  body: new URLSearchParams({ csrfToken, username: "proprietario", password: "proprietario123", redirect: "false", json: "true" }).toString(),
  redirect: "manual",
}); pc(lr, jar);

// 1. Fuera el ítem de la sonda (y sus reservas, por cascade)
const basura = await sql(`SELECT id, name FROM ContestItem WHERE name = 'PRUEBA_X'`);
for (const it of basura) {
  await sql(`DELETE FROM ContestItem WHERE id = ?`, [it.id]);
  console.log(`Eliminado el ítem de prueba: ${it.name}`);
}

// 2. El ítem real vuelve a estar en juego
const res = await sql(
  `UPDATE ContestItem SET outcome = 'PENDIENTE', resolvedAt = NULL, resolvedById = NULL
   WHERE name = 'Venta de Cervezas' AND outcome = 'DESIERTO'`);
console.log(`"Venta de Cervezas" devuelto a PENDIENTE`);

// Las reservas devueltas por la sonda se descartan: el recálculo crea las nuevas.
await sql(`DELETE FROM ContestTipReserve WHERE status = 'DEVUELTA'`);

// 3. Recálculo por el camino real
const dias = await sql(
  `SELECT t.id, t.date, t.totalAmount, t.notes FROM TipEntry t
   JOIN Contest c ON t.date >= c.startDate AND t.date <= c.endDate
   WHERE c.status = 'ACTIVO' ORDER BY t.date`);

console.log(`\nRecalculando ${dias.length} día(s):`);
for (const d of dias) {
  const r = await fetch(`${BASE}/api/admin/tips/${d.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ch(jar) },
    body: JSON.stringify({ totalAmount: Number(d.totalAmount), notes: d.notes ?? undefined }),
  });
  const [f] = await sql(
    `SELECT totalAmount, menaje, contestReserved, netAmount FROM TipEntry WHERE id = ?`, [d.id]);
  const cuadra = Math.round(Number(f.totalAmount)) ===
    Math.round(Number(f.menaje) + Number(f.contestReserved) + Number(f.netAmount));
  console.log(`  ${d.date}  ${r.ok ? "ok" : "ERROR " + r.status}  reservado=${money(f.contestReserved)}  neto=${money(f.netAmount)}  ${cuadra ? "cuadra" : "REVISAR"}`);
}

// 4. Comprobación final
const [tot] = await sql(
  `SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM ContestTipReserve WHERE status = 'RESERVADA'`);
const items = await sql(`SELECT name, outcome, percent FROM ContestItem`);
const [inv] = await sql(
  `SELECT COUNT(*) n FROM TipEntry WHERE ROUND(totalAmount) != ROUND(menaje + contestReserved + netAmount)`);

console.log(`\nÍtems del concurso:`);
items.forEach((i) => console.log(`  ${i.name}  ${i.outcome}  ${i.percent}%`));
console.log(`Reservas activas: ${tot.n} por ${money(tot.s)}`);
console.log(`Invariante rota en ${inv.n} fila(s)`);

await db.close();
