/**
 * Inserta registros de horas de prueba para TODOS los empleados activos en las
 * fechas que ya tienen propinas registradas.
 *
 * Se hace por la API, no por SQL, para que corra el camino real:
 *   - `isSpecial` se calcula en el servidor (domingos y festivos colombianos),
 *   - se validan solapes y topes de jornada,
 *   - y al crear cada registro se dispara el recálculo de las propinas del día,
 *     que es lo que hace que el reparto aparezca.
 *
 * Es idempotente: si un empleado ya tiene horas ese día, se salta.
 *
 * Uso: node scripts/sembrar-horas-agosto.mjs [--desde 2026-08-01] [--hasta 2026-08-31]
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { existsSync } from "fs";

for (const f of [".env.local", ".env"]) if (existsSync(f)) config({ path: f, override: false, quiet: true });

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const sql = async (s, args = []) => (await db.execute({ sql: s, args })).rows;

const arg = (n, def) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DESDE = arg("--desde", "2026-08-01");
const HASTA = arg("--hasta", "2026-08-31");

const money = (n) => new Intl.NumberFormat("es-CO").format(Math.round(n));

function parseCookies(res, jar) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";"); const i = p.indexOf("=");
    jar[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
}
const ch = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");
const jar = {};

async function login(u, p) {
  const cr = await fetch(`${BASE}/api/auth/csrf`); parseCookies(cr, jar);
  const { csrfToken } = await cr.json();
  const lr = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: ch(jar) },
    body: new URLSearchParams({ csrfToken, username: u, password: p, redirect: "false", json: "true" }).toString(),
    redirect: "manual",
  });
  parseCookies(lr, jar);
  const s = await (await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: ch(jar) } })).json();
  if (!s?.user) throw new Error("No se pudo iniciar sesión. ¿Está corriendo el dev server?");
}

// Turnos distintos por empleado: así el reparto de propinas queda proporcional
// a las horas y se puede comprobar a ojo que no es un reparto plano.
// Todos ≤ 8 h y sin cruzar medianoche, para no disparar la confirmación de
// jornada larga ni la regla de cruce hasta las 02:00.
const TURNOS = [
  { inicio: "14:00", fin: "22:00" }, // 8 h
  { inicio: "15:00", fin: "22:00" }, // 7 h
  { inicio: "16:00", fin: "22:00" }, // 6 h
  { inicio: "17:00", fin: "22:00" }, // 5 h
];

await login("proprietario", "proprietario123");

const fechas = (await sql(
  `SELECT date FROM TipEntry WHERE date >= ? AND date <= ? ORDER BY date`, [DESDE, HASTA]
)).map((r) => r.date);

const empleados = await sql(
  `SELECT id, name, payType FROM Employee WHERE active = 1 ORDER BY name`);

if (fechas.length === 0) { console.log(`No hay propinas registradas entre ${DESDE} y ${HASTA}.`); process.exit(0); }

console.log(`Fechas con propinas: ${fechas.length}  (${fechas[0]} .. ${fechas[fechas.length - 1]})`);
console.log(`Empleados activos:   ${empleados.length}`);
console.log();

let creados = 0, saltados = 0, errores = 0;

for (const fecha of fechas) {
  const yaTienen = new Set(
    (await sql(`SELECT DISTINCT employeeId FROM TimeEntry WHERE date = ?`, [fecha])).map((r) => r.employeeId));

  const detalle = [];
  for (let i = 0; i < empleados.length; i++) {
    const emp = empleados[i];
    if (yaTienen.has(emp.id)) { saltados++; detalle.push(`${emp.name}=ya tenía`); continue; }

    const turno = TURNOS[i % TURNOS.length];
    const res = await fetch(`${BASE}/api/admin/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ch(jar) },
      body: JSON.stringify({
        employeeId: emp.id,
        date: fecha,
        checkIn: `${fecha}T${turno.inicio}:00.000Z`,
        checkOut: `${fecha}T${turno.fin}:00.000Z`,
        notes: "Registro de prueba",
      }),
    });

    if (res.ok) { creados++; detalle.push(`${emp.name}=${turno.inicio}-${turno.fin}`); }
    else {
      errores++;
      const t = await res.text();
      detalle.push(`${emp.name}=ERROR ${res.status}`);
      console.log(`    ${fecha} ${emp.name}: ${t.slice(0, 160)}`);
    }
  }
  console.log(`  ${fecha}  ${detalle.join("  |  ")}`);
}

console.log(`\nCreados: ${creados}   Saltados (ya tenían): ${saltados}   Errores: ${errores}`);

// ── Comprobación: el reparto se rehízo y la invariante cuadra ────────────────
console.log(`\n${"=".repeat(78)}`);
console.log("  RESULTADO POR DÍA");
console.log("=".repeat(78));

let invariantesRotas = 0;
for (const fecha of fechas) {
  const [t] = await sql(
    `SELECT totalAmount, menaje, contestReserved, netAmount FROM TipEntry WHERE date = ?`, [fecha]);
  const dist = await sql(
    `SELECT e.name, td.hoursWorked, td.amount, td.effectiveHours
     FROM TipDistribution td
     JOIN Employee e ON e.id = td.employeeId
     JOIN TipEntry te ON te.id = td.tipEntryId
     WHERE te.date = ? ORDER BY td.amount DESC`, [fecha]);

  const repartido = dist.reduce((s, d) => s + Number(d.amount), 0);
  const cuadraInv = Math.round(Number(t.totalAmount)) ===
    Math.round(Number(t.menaje) + Number(t.contestReserved) + Number(t.netAmount));
  // El reparto puede quedar 1–2 pesos por debajo del neto por el redondeo de
  // cada participante; nunca por encima.
  const cuadraReparto = repartido <= Number(t.netAmount) && Number(t.netAmount) - repartido < dist.length + 1;
  if (!cuadraInv || !cuadraReparto) invariantesRotas++;

  const especial = (await sql(`SELECT isSpecial FROM TimeEntry WHERE date = ? LIMIT 1`, [fecha]))[0];
  console.log(`\n  ${fecha}${especial?.isSpecial ? "  [día especial]" : ""}`);
  console.log(`    total=${money(t.totalAmount)}  menaje=${money(t.menaje)}  concursos=${money(t.contestReserved)}  neto=${money(t.netAmount)}`);
  for (const d of dist)
    console.log(`      ${String(d.name).padEnd(20)} ${String(d.hoursWorked).padStart(5)} h  ->  ${money(d.amount).padStart(10)}`);
  console.log(`      ${"".padEnd(20)} ${String(dist.reduce((s, d) => s + Number(d.hoursWorked), 0)).padStart(5)} h      ${money(repartido).padStart(10)}  ${cuadraInv && cuadraReparto ? "OK" : "REVISAR"}`);
}

console.log(`\n${"=".repeat(78)}`);
console.log(invariantesRotas === 0
  ? "  Todos los días cuadran: total = menaje + concursos + neto, y el reparto no excede el neto."
  : `  ATENCIÓN: ${invariantesRotas} día(s) no cuadran.`);
console.log("=".repeat(78));

await db.close();
process.exit(invariantesRotas === 0 && errores === 0 ? 0 : 1);
