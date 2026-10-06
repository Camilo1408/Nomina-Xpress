/**
 * Devuelve un ítem de concurso de DESIERTO a PENDIENTE y recupera su reserva.
 *
 * Declarar un ítem desierto es irreversible desde la aplicación —y así debe ser,
 * porque devuelve dinero al reparto—, pero un clic equivocado deja al concurso
 * sin premio y no hay forma de deshacerlo desde el UI. Esta es esa salida.
 *
 * Cómo funciona: pone el ítem en PENDIENTE y luego hace un PUT sobre cada
 * TipEntry del rango del concurso con su MISMO importe. Eso dispara el recálculo
 * real de la aplicación: `resolveContestDeductionsForDate` vuelve a ver el ítem
 * (PENDIENTE dentro de un concurso ACTIVO) y la reserva se recrea con los
 * porcentajes vigentes. No se inventa ningún número a mano.
 *
 * Solo aplica a concursos en estado ACTIVO. Si el concurso ya está FINALIZADO su
 * reserva está congelada y esto no la recupera: en ese caso hay que reabrirlo
 * antes, con el cuidado que eso merece.
 *
 * Requiere el dev server (o el despliegue) corriendo y las credenciales en el
 * entorno.
 *
 * Uso:
 *   node scripts/restaurar-item-desierto.mjs "Venta de Cervezas"
 *   node scripts/restaurar-item-desierto.mjs --listar
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { existsSync } from "fs";

for (const f of [".env.local", ".env"]) if (existsSync(f)) config({ path: f, override: false, quiet: true });

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const USER = process.env.ADMIN_USER ?? "proprietario";
const PASS = process.env.ADMIN_PASS ?? "proprietario123";

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const sql = async (s, args = []) => (await db.execute({ sql: s, args })).rows;
const money = (n) => new Intl.NumberFormat("es-CO").format(Math.round(n));

function parseCookies(res, jar) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";"); const i = p.indexOf("=");
    jar[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
}
const ch = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");

const argumento = process.argv[2];

// ── Modo listado: qué ítems desiertos hay ───────────────────────────────────
if (!argumento || argumento === "--listar") {
  const items = await sql(
    `SELECT i.name, i.percent, i.outcome, c.name contest, c.status
     FROM ContestItem i JOIN Contest c ON c.id = i.contestId
     WHERE i.outcome = 'DESIERTO' ORDER BY c.name, i.name`);

  if (items.length === 0) console.log("No hay ítems declarados desiertos.");
  else {
    console.log("Ítems desiertos:");
    for (const i of items) {
      const recuperable = i.status === "ACTIVO" ? "" : `  (concurso ${i.status}: NO recuperable con este script)`;
      console.log(`  "${i.name}"  ${i.percent}%  —  concurso "${i.contest}"${recuperable}`);
    }
    console.log(`\nPara restaurar uno:  node scripts/restaurar-item-desierto.mjs "<nombre del ítem>"`);
  }
  await db.close();
  process.exit(0);
}

// ── Restauración ────────────────────────────────────────────────────────────
const [item] = await sql(
  `SELECT i.id, i.name, i.percent, i.outcome, c.id contestId, c.name contest, c.status, c.startDate, c.endDate
   FROM ContestItem i JOIN Contest c ON c.id = i.contestId
   WHERE i.name = ?`, [argumento]);

if (!item) {
  console.error(`No existe ningún ítem llamado "${argumento}". Usa --listar para verlos.`);
  process.exit(1);
}
if (item.outcome !== "DESIERTO") {
  console.error(`"${item.name}" está en ${item.outcome}, no en DESIERTO. No hay nada que restaurar.`);
  process.exit(1);
}
if (item.status !== "ACTIVO") {
  console.error(
    `El concurso "${item.contest}" está en ${item.status}. Este script solo restaura ítems de\n` +
    `concursos ACTIVOS: en un concurso finalizado la reserva está congelada y recrearla\n` +
    `exige decidir antes qué pasa con los bonos ya emitidos.`);
  process.exit(1);
}

console.log(`Restaurando "${item.name}" (${item.percent}%) del concurso "${item.contest}"`);
console.log(`Rango: ${item.startDate} a ${item.endDate}\n`);

const jar = {};
const cr = await fetch(`${BASE}/api/auth/csrf`); parseCookies(cr, jar);
const { csrfToken } = await cr.json();
const lr = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: ch(jar) },
  body: new URLSearchParams({ csrfToken, username: USER, password: PASS, redirect: "false", json: "true" }).toString(),
  redirect: "manual",
}); parseCookies(lr, jar);
const ses = await (await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: ch(jar) } })).json();
if (!ses?.user) { console.error(`No se pudo iniciar sesión en ${BASE}. ¿Está corriendo el servidor?`); process.exit(1); }

await sql(
  `UPDATE ContestItem SET outcome = 'PENDIENTE', resolvedAt = NULL, resolvedById = NULL WHERE id = ?`,
  [item.id]);

// Las reservas devueltas se descartan: el recálculo crea las nuevas, y dejar las
// dos versiones convivendo haría que contestReserved dejara de cuadrar.
await sql(`DELETE FROM ContestTipReserve WHERE contestItemId = ? AND status = 'DEVUELTA'`, [item.id]);

const dias = await sql(
  `SELECT id, date, totalAmount, notes FROM TipEntry
   WHERE date >= ? AND date <= ? ORDER BY date`, [item.startDate, item.endDate]);

let errores = 0, descuadres = 0;
for (const d of dias) {
  const r = await fetch(`${BASE}/api/admin/tips/${d.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ch(jar) },
    body: JSON.stringify({ totalAmount: Number(d.totalAmount), notes: d.notes ?? undefined }),
  });
  if (!r.ok) { console.log(`  ${d.date}  ERROR ${r.status}`); errores++; continue; }

  const [f] = await sql(
    `SELECT totalAmount, menaje, contestReserved, netAmount FROM TipEntry WHERE id = ?`, [d.id]);
  const cuadra = Math.round(Number(f.totalAmount)) ===
    Math.round(Number(f.menaje) + Number(f.contestReserved) + Number(f.netAmount));
  if (!cuadra) descuadres++;
  console.log(`  ${d.date}  reservado=${money(f.contestReserved)}  neto=${money(f.netAmount)}  ${cuadra ? "cuadra" : "DESCUADRE"}`);
}

const [tot] = await sql(
  `SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM ContestTipReserve
   WHERE contestItemId = ? AND status = 'RESERVADA'`, [item.id]);
console.log(`\n"${item.name}" vuelve a PENDIENTE con ${money(tot.s)} reservados en ${tot.n} día(s).`);
if (errores || descuadres) {
  console.error(`ATENCIÓN: ${errores} error(es) y ${descuadres} día(s) descuadrados. Revisar antes de continuar.`);
  process.exitCode = 1;
}

await db.close();
