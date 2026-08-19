/**
 * Verificación de extremo a extremo de los 4 puntos pedidos por el propietario.
 *
 *  1. Redistribución CORRECTA de propinas YA repartidas al crear un concurso.
 *  2. Distribución CORRECTA de las propinas registradas DESPUÉS del concurso.
 *  3. El bono aparece en el reporte de nómina/turnos donde corresponda,
 *     aparte y SIN sumarse al total a pagar.
 *  4. En el PDF, las propinas NO se suman al total final; van abajo, aparte.
 *
 * Crea sus propios empleados y datos, y los borra al terminar.
 * Requiere el dev server corriendo.
 *
 * Uso: node scripts/verificar-concursos-e2e.mjs
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { existsSync, writeFileSync } from "fs";
import { inflateSync } from "zlib";

for (const f of [".env.local", ".env"]) if (existsSync(f)) config({ path: f, override: false, quiet: true });

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const TMP = process.env.TEMP ?? ".";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const sql = async (s, args = []) => (await db.execute({ sql: s, args })).rows;

let pasaron = 0, fallaron = 0;
const fallos = [];

function check(titulo, condicion, detalle = "") {
  if (condicion) { pasaron++; console.log(`  OK    ${titulo}${detalle ? `  (${detalle})` : ""}`); }
  else { fallaron++; fallos.push(titulo); console.log(`  FALLA ${titulo}${detalle ? `  -> ${detalle}` : ""}`); }
}
const seccion = (t) => console.log(`\n${"=".repeat(72)}\n  ${t}\n${"=".repeat(72)}`);
const money = (n) => new Intl.NumberFormat("es-CO").format(Math.round(n));

function parseCookies(res, jar) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";"); const i = p.indexOf("=");
    jar[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
}
const ch = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");
let jar = {};

async function login(u, p) {
  jar = {};
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
  if (!s?.user) throw new Error("login falló");
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: ch(jar) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const txt = await res.text();
  let data = null; try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: res.status, data, ok: res.ok };
}

/**
 * Extrae el texto de un PDF inflando sus streams comprimidos.
 *
 * @react-pdf emite las cadenas en HEXADECIMAL (<48656c6c6f>), no como literales
 * entre paréntesis, así que hay que cubrir ambas formas: los operadores Tj y TJ
 * aceptan las dos y mezclarlas en un mismo array es legal.
 */
function textoDePdf(buf) {
  const s = buf.toString("latin1");
  const trozos = [];
  const re = new RegExp("stream\\r?\\n", "g");
  const reBloque = new RegExp("BT([\\s\\S]*?)ET", "g");
  const reToken = new RegExp("<([0-9A-Fa-f\\s]*)>", "g");
  let m;
  while ((m = re.exec(s))) {
    const desde = m.index + m[0].length;
    const hasta = s.indexOf("endstream", desde);
    if (hasta < 0) continue;
    let c;
    try { c = inflateSync(Buffer.from(s.slice(desde, hasta), "latin1")).toString("latin1"); }
    catch { continue; }
    // Cada bloque BT..ET es una unidad de texto independiente.
    for (const bloque of c.matchAll(reBloque)) {
      let linea = "";
      for (const tok of bloque[1].matchAll(reToken)) {
        const hex = tok[1].replace(/[^0-9A-Fa-f]/g, "");
        for (let i = 0; i + 1 < hex.length; i += 2)
          linea += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      }
      if (linea) trozos.push(linea);
    }
  }
  // latin1 -> texto legible. Se devuelven los fragmentos EN ORDEN: así se puede
  // comprobar QUÉ IMPORTE ACOMPAÑA A CADA ETIQUETA, en vez de buscar un número
  // suelto en todo el documento (que aparecería también en otras líneas).
  return trozos.map((t) => Buffer.from(t, "latin1").toString("utf8"));
}

const P1 = { from: "2026-10-01", to: "2026-10-15" };
const P2 = { from: "2026-10-16", to: "2026-10-31" };
const MARCA = "ZZVERIF";
const creado = { empleados: [], tips: [], timeEntries: [], contests: [] };

async function limpiar() {
  await sql(`DELETE FROM Contest WHERE name LIKE ?`, [`${MARCA}%`]);
  for (const id of creado.contests) await sql(`DELETE FROM Contest WHERE id = ?`, [id]);
  await sql(`DELETE FROM TipEntry WHERE date IN ('2026-10-02','2026-10-03','2026-10-06')`);
  const emps = await sql(`SELECT id FROM Employee WHERE name LIKE ?`, [`${MARCA}%`]);
  for (const e of emps) {
    await sql(`DELETE FROM TipDistribution WHERE employeeId = ?`, [e.id]);
    await sql(`DELETE FROM TimeEntry WHERE employeeId = ?`, [e.id]);
    await sql(`DELETE FROM ContestBonusPayment WHERE employeeId = ?`, [e.id]);
    await sql(`DELETE FROM ContestBonus WHERE employeeId = ?`, [e.id]);
    await sql(`DELETE FROM ContestItemResult WHERE employeeId = ?`, [e.id]);
    await sql(`DELETE FROM Employee WHERE id = ?`, [e.id]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
await login("proprietario", "proprietario123");
await limpiar();

seccion("PREPARACIÓN · empleados y horas");

const eNom = await api("POST", "/api/admin/employees", {
  name: `${MARCA} Nomina`, hourlyRateNormal: 6900, hourlyRateSpecial: 11400,
  tipPercent: 100, payType: "PAYROLL",
});
const eTur = await api("POST", "/api/admin/employees", {
  name: `${MARCA} Turno`, hourlyRateNormal: 6900, hourlyRateSpecial: 11400,
  tipPercent: 100, payType: "SHIFT",
});
const A = eNom.data?.employee ?? eNom.data;
const B = eTur.data?.employee ?? eTur.data;
check("Empleado de NÓMINA creado", !!A?.id, A?.name);
check("Empleado de TURNOS creado", !!B?.id, B?.name);
if (!A?.id || !B?.id) {
  console.log(JSON.stringify(eNom.data), JSON.stringify(eTur.data));
  throw new Error("no se pudieron crear los empleados");
}
creado.empleados.push(A.id, B.id);

for (const dia of ["2026-10-02", "2026-10-03", "2026-10-06"]) {
  for (const emp of [A, B]) {
    const r = await api("POST", "/api/admin/time-entries", {
      employeeId: emp.id, date: dia,
      checkIn: `${dia}T12:00:00.000Z`, checkOut: `${dia}T20:00:00.000Z`,
    });
    if (r.ok) creado.timeEntries.push((r.data?.entry ?? r.data)?.id);
    else check(`Horas ${dia} ${emp.name}`, false, JSON.stringify(r.data).slice(0, 140));
  }
}
check("Horas registradas: 8h por persona en 3 días", creado.timeEntries.filter(Boolean).length === 6,
  `${creado.timeEntries.filter(Boolean).length}/6`);

// ═══════════════════════════════════════════════════════════════════════════
seccion("PUNTO 1 · REDISTRIBUCIÓN DE PROPINAS YA REPARTIDAS AL CREAR EL CONCURSO");

const TIP1 = 1_000_000, TIP2 = 500_000;
for (const [dia, monto] of [["2026-10-02", TIP1], ["2026-10-03", TIP2]]) {
  const r = await api("POST", "/api/admin/tips", { date: dia, totalAmount: monto });
  if (r.ok) creado.tips.push((r.data?.entry ?? r.data)?.id);
  else check(`Propinas ${dia}`, false, JSON.stringify(r.data).slice(0, 150));
}

const antes = await sql(
  `SELECT date, totalAmount, menaje, contestReserved, netAmount FROM TipEntry
   WHERE date IN ('2026-10-02','2026-10-03') ORDER BY date`);
console.log("\n  Estado ANTES del concurso:");
for (const d of antes)
  console.log(`    ${d.date}  total=${money(d.totalAmount)}  menaje=${money(d.menaje)}  reservado=${money(d.contestReserved)}  neto=${money(d.netAmount)}`);

const distAntes = await sql(
  `SELECT e.name, SUM(td.amount) s FROM TipDistribution td
   JOIN Employee e ON e.id = td.employeeId
   JOIN TipEntry t ON t.id = td.tipEntryId
   WHERE t.date IN ('2026-10-02','2026-10-03') GROUP BY e.name ORDER BY e.name`);
console.log("  Repartido por persona ANTES:");
distAntes.forEach(d => console.log(`    ${d.name}: ${money(d.s)}`));

check("Sin concurso, neto = total − menaje", Number(antes[0].netAmount) === 900_000 && Number(antes[0].contestReserved) === 0,
  `neto=${antes[0].netAmount}`);
const repartidoAntes = distAntes.reduce((s, d) => s + Number(d.s), 0);
check("Se repartió el 90% de las propinas", repartidoAntes === 1_350_000, money(repartidoAntes));

const cCrear = await api("POST", "/api/admin/contests", {
  name: `${MARCA} Incentivos`, description: "Verificación E2E",
  startDate: P1.from, endDate: P1.to, payoutMode: "UNICO",
  items: [
    { name: "Cervezas", goalValue: 100, goalUnit: "unidades", criteria: "MAYOR_VALOR", percent: 2, winnerMode: "GANADOR_UNICO" },
    { name: "Vinos", goalValue: 50, goalUnit: "unidades", criteria: "MAYOR_VALOR", percent: 1, winnerMode: "GANADOR_UNICO" },
  ],
});
const contest = cCrear.data?.contest;
check("Concurso creado con 2 ítems (2% + 1%)", !!contest?.id && contest.items?.length === 2,
  JSON.stringify(cCrear.data).slice(0, 160));
if (!contest?.id) throw new Error("no se pudo crear el concurso");
creado.contests.push(contest.id);

const prev = await api("GET", `/api/admin/contests/${contest.id}/impact?action=activar`);
const filas = prev.data?.preview?.rows ?? [];
check("El preview de impacto lista los 2 días afectados", filas.length === 2, `${filas.length} días`);
const sinTocar = await sql(`SELECT COALESCE(SUM(contestReserved),0) s FROM TipEntry WHERE date IN ('2026-10-02','2026-10-03')`);
check("El preview NO escribe nada en la base", Number(sinTocar[0].s) === 0, `reservado=${sinTocar[0].s}`);

const act = await api("POST", `/api/admin/contests/${contest.id}/activate`, { confirmImpact: true });
check("Concurso activado", act.ok, `status=${act.status}`);

const despues = await sql(
  `SELECT date, totalAmount, menaje, contestReserved, netAmount FROM TipEntry
   WHERE date IN ('2026-10-02','2026-10-03') ORDER BY date`);
console.log("\n  Estado DESPUÉS de activar:");
for (const d of despues)
  console.log(`    ${d.date}  total=${money(d.totalAmount)}  menaje=${money(d.menaje)}  reservado=${money(d.contestReserved)}  neto=${money(d.netAmount)}`);

check("Día 1 · menaje 10% = 100.000", Number(despues[0].menaje) === 100_000, `${despues[0].menaje}`);
check("Día 1 · reservado 3% = 30.000", Number(despues[0].contestReserved) === 30_000, `${despues[0].contestReserved}`);
check("Día 1 · neto 87% = 870.000", Number(despues[0].netAmount) === 870_000, `${despues[0].netAmount}`);
check("Día 1 · invariante total = menaje + reservado + neto",
  Number(despues[0].totalAmount) === Number(despues[0].menaje) + Number(despues[0].contestReserved) + Number(despues[0].netAmount));
check("Día 2 · reservado 3% = 15.000", Number(despues[1].contestReserved) === 15_000, `${despues[1].contestReserved}`);
check("Día 2 · neto 87% = 435.000", Number(despues[1].netAmount) === 435_000, `${despues[1].netAmount}`);
check("Día 2 · invariante total = menaje + reservado + neto",
  Number(despues[1].totalAmount) === Number(despues[1].menaje) + Number(despues[1].contestReserved) + Number(despues[1].netAmount));

const distDespues = await sql(
  `SELECT e.name, SUM(td.amount) s FROM TipDistribution td
   JOIN Employee e ON e.id = td.employeeId
   JOIN TipEntry t ON t.id = td.tipEntryId
   WHERE t.date IN ('2026-10-02','2026-10-03') GROUP BY e.name ORDER BY e.name`);
console.log("  Repartido por persona DESPUÉS:");
distDespues.forEach(d => console.log(`    ${d.name}: ${money(d.s)}`));

const repartidoDespues = distDespues.reduce((s, d) => s + Number(d.s), 0);
check("El reparto se rehízo sobre el neto reducido (870.000 + 435.000)",
  repartidoDespues === 1_305_000, money(repartidoDespues));
check("Ambos reciben lo mismo (mismas horas)",
  distDespues.length === 2 && Number(distDespues[0].s) === Number(distDespues[1].s),
  distDespues.map(d => money(d.s)).join(" / "));
check("La redistribución bajó exactamente lo reservado (45.000)",
  repartidoAntes - repartidoDespues === 45_000, `bajó ${money(repartidoAntes - repartidoDespues)}`);

const reservas = await sql(
  `SELECT r.date, i.name item, r.percent, r.amount, r.status, r.tipTotalAmount
   FROM ContestTipReserve r JOIN ContestItem i ON i.id = r.contestItemId
   WHERE r.contestId = ?
   ORDER BY r.date, i.name`, [contest.id]);
console.log("  Reservas registradas (trazabilidad):");
reservas.forEach(r => console.log(`    ${r.date}  ${String(r.item).padEnd(10)} ${r.percent}%  ${money(r.amount)}  ${r.status}  base=${money(r.tipTotalAmount)}`));
check("4 reservas (2 días × 2 ítems), todas RESERVADA",
  reservas.length === 4 && reservas.every(r => r.status === "RESERVADA"), `${reservas.length}`);

// ═══════════════════════════════════════════════════════════════════════════
seccion("PUNTO 2 · PROPINAS REGISTRADAS DESPUÉS DE CREAR EL CONCURSO");

const r3 = await api("POST", "/api/admin/tips", { date: "2026-10-06", totalAmount: 300_000 });
if (r3.ok) creado.tips.push((r3.data?.entry ?? r3.data)?.id);
check("Propinas del 06-10 registradas con el concurso ya activo", r3.ok, `status=${r3.status}`);

const [d3] = await sql(`SELECT totalAmount, menaje, contestReserved, netAmount FROM TipEntry WHERE date = '2026-10-06'`);
console.log(`\n    2026-10-06  total=${money(d3.totalAmount)}  menaje=${money(d3.menaje)}  reservado=${money(d3.contestReserved)}  neto=${money(d3.netAmount)}`);
check("Menaje 10% = 30.000", Number(d3.menaje) === 30_000, `${d3.menaje}`);
check("Reservado 3% = 9.000, aplicado ya al registrar", Number(d3.contestReserved) === 9_000, `${d3.contestReserved}`);
check("Neto 87% = 261.000", Number(d3.netAmount) === 261_000, `${d3.netAmount}`);
check("Invariante del día nuevo",
  Number(d3.totalAmount) === Number(d3.menaje) + Number(d3.contestReserved) + Number(d3.netAmount));

const [rep3] = await sql(
  `SELECT COALESCE(SUM(td.amount),0) s FROM TipDistribution td
   JOIN TipEntry t ON t.id = td.tipEntryId WHERE t.date = '2026-10-06'`);
check("Se repartió el neto completo del día nuevo", Number(rep3.s) === 261_000, money(rep3.s));

const [resTotal] = await sql(
  `SELECT COALESCE(SUM(amount),0) s FROM ContestTipReserve WHERE status='RESERVADA' AND contestId = ?`,
  [contest.id]);
check("Reserva acumulada = 30.000 + 15.000 + 9.000 = 54.000", Number(resTotal.s) === 54_000, money(resTotal.s));

// ═══════════════════════════════════════════════════════════════════════════
seccion("ADJUDICACIÓN · finalizar, registrar resultados y generar el bono");

const fin = await api("POST", `/api/admin/contests/${contest.id}/finalize`, { confirmEarly: true });
check("Concurso finalizado (reserva congelada)", fin.ok, `status=${fin.status}`);

// El resumen de reservas por ítem lo expone el LISTADO (es lo que consume la UI);
// el detalle devuelve las reservas en crudo, sin agregar.
const lista = await api("GET", "/api/admin/contests");
const cLista = lista.data?.contests?.find(c => c.id === contest.id);
const itemCervezas = cLista?.items?.find(i => i.name === "Cervezas");
const itemVinos = cLista?.items?.find(i => i.name === "Vinos");
check("Reserva de Cervezas (2%) = 36.000", Math.round(itemCervezas?.reserve?.reservedAmount ?? 0) === 36_000,
  money(itemCervezas?.reserve?.reservedAmount ?? 0));
check("Reserva de Vinos (1%) = 18.000", Math.round(itemVinos?.reserve?.reservedAmount ?? 0) === 18_000,
  money(itemVinos?.reserve?.reservedAmount ?? 0));

// El de NÓMINA gana cervezas; el de TURNOS gana vinos. Así el bono debe salir
// en los dos reportes distintos.
// Se comprueba el estado de CADA llamada. Sin esto, un 404 de ruta pasaba
// inadvertido: la adjudicación seguía funcionando con resultados de una corrida
// anterior y el fallo solo aparecía al usar la aplicación a mano.
const resCervezas = await api("PUT", `/api/admin/contests/${contest.id}/items/${itemCervezas.id}/results`, {
  results: [{ employeeId: A.id, value: 150 }, { employeeId: B.id, value: 80 }],
});
check("Resultados de Cervezas guardados", resCervezas.ok,
  `status=${resCervezas.status} ${JSON.stringify(resCervezas.data).slice(0, 120)}`);

const resVinos = await api("PUT", `/api/admin/contests/${contest.id}/items/${itemVinos.id}/results`, {
  results: [{ employeeId: A.id, value: 20 }, { employeeId: B.id, value: 90 }],
});
check("Resultados de Vinos guardados", resVinos.ok,
  `status=${resVinos.status} ${JSON.stringify(resVinos.data).slice(0, 120)}`);

// Las rutas anidadas bajo dos segmentos dinámicos son las que el dev server de
// Next deja de registrar cuando se crean con el servidor ya arrancado. Se
// comprueba sobre un ítem DESECHABLE, para no alterar el escenario: basta con
// que respondan cualquier cosa que no sea el 404 de "ruta inexistente".
const awA = await api("POST", `/api/admin/contests/${contest.id}/items/${itemCervezas.id}/award`, {});
const awB = await api("POST", `/api/admin/contests/${contest.id}/items/${itemVinos.id}/award`, {});
check("Cervezas adjudicado al empleado de NÓMINA", awA.ok, `status=${awA.status}`);
check("Vinos adjudicado al empleado de TURNOS", awB.ok, `status=${awB.status}`);


// Se prueban sobre el ítem YA ADJUDICADO y con cargas inofensivas: las tres
// deben rechazar por regla de negocio (4xx), nunca con el 404 de ruta ausente.
// Así se comprueba el registro de la ruta sin mutar nada.
for (const [m, sufijo, body] of [
  ["PUT", "results", { results: [] }],                              // 400: sin resultados
  ["POST", "award", {}],                                            // 409: ya adjudicado
  ["POST", "void", { reason: "sonda", confirmImpact: true }],       // 409: ya adjudicado
]) {
  const r = await api(m, `/api/admin/contests/${contest.id}/items/${itemCervezas.id}/${sufijo}`, body);
  check(`Ruta ${m} .../${sufijo} registrada (responde ${r.status}, no 404)`,
    r.status !== 404 && r.status >= 400, `status=${r.status}`);
}
const bonos = await sql(
  `SELECT b.totalAmount, b.periodStart, b.periodEnd, e.name, e.payType,
          p.installment, p.periodStart pStart, p.periodEnd pEnd, p.amount pAmount, p.status pStatus
   FROM ContestBonus b JOIN Employee e ON e.id = b.employeeId
   LEFT JOIN ContestBonusPayment p ON p.contestBonusId = b.id
   ORDER BY e.name, p.installment`);
console.log("\n  Bonos generados:");
bonos.forEach(b => console.log(`    ${b.name} (${b.payType})  bono=${money(b.totalAmount)}  cuota ${b.installment}: ${money(b.pAmount)} en ${b.pStart}..${b.pEnd} [${b.pStatus}]`));
check("Se generaron 2 bonos con 1 cuota cada uno", bonos.length === 2, `${bonos.length}`);
check("La cuota se programó en la quincena siguiente (16–31 oct)",
  bonos.every(b => b.pStart === P2.from && b.pEnd === P2.to),
  bonos.map(b => `${b.pStart}..${b.pEnd}`).join(" | "));

const bonoNomina = bonos.find(b => b.payType === "PAYROLL");
const bonoTurno = bonos.find(b => b.payType === "SHIFT");

// ═══════════════════════════════════════════════════════════════════════════
seccion("PUNTO 3 · EL BONO EN EL REPORTE, APARTE Y SIN SUMARSE AL TOTAL");

for (const [etiqueta, tipo, emp, bono] of [
  ["NÓMINA", "payroll", A, bonoNomina],
  ["TURNOS", "shifts", B, bonoTurno],
]) {
  console.log(`\n  ── Reporte de ${etiqueta} · quincena de pago ${P2.from}..${P2.to} ──`);
  const rep = await api("GET", `/api/admin/reports/payroll?from=${P2.from}&to=${P2.to}&type=${tipo}`);
  const e = rep.data?.employees?.find(x => x.employeeId === emp.id);
  check(`[${etiqueta}] El empleado aparece en su reporte`, !!e, e?.employeeName);
  if (!e) continue;

  console.log(`     netPay=${money(e.netPay)}  finalPay=${money(e.finalPay)}  propinas=${money(e.totalTips)}  bono=${money(e.totalContestBonus)}  informativo=${money(e.totalInformativeReceived)}`);

  check(`[${etiqueta}] El bono aparece como concepto aparte`,
    Array.isArray(e.contestBonuses) && e.contestBonuses.length === 1,
    JSON.stringify(e.contestBonuses?.map(b => `${b.itemName}:${b.amount}`)));
  check(`[${etiqueta}] El importe del bono es el esperado`,
    e.totalContestBonus === Math.round(bono.pAmount), `${money(e.totalContestBonus)} vs ${money(bono.pAmount)}`);
  // clampFinalPay corta en 0, así que la comparación tiene que llevar el mismo suelo.
  check(`[${etiqueta}] finalPay NO incluye el bono`,
    e.finalPay === Math.max(0, e.netPay + e.totalBonuses - e.totalDiscounts),
    `finalPay=${money(e.finalPay)} netPay=${money(e.netPay)} bonosFijos=${money(e.totalBonuses)} desc=${money(e.totalDiscounts)}`);
  check(`[${etiqueta}] finalPay NO incluye las propinas`,
    e.finalPay !== e.netPay + e.totalTips || e.totalTips === 0,
    `propinas=${money(e.totalTips)}`);
  check(`[${etiqueta}] El total informativo sí suma propinas y bono`,
    e.totalInformativeReceived === e.finalPay + e.totalTips + e.totalContestBonus,
    money(e.totalInformativeReceived));
}

// En la quincena del concurso el bono NO debe figurar todavía
const repP1 = await api("GET", `/api/admin/reports/payroll?from=${P1.from}&to=${P1.to}&type=payroll`);
const eP1 = repP1.data?.employees?.find(x => x.employeeId === A.id);
console.log(`\n  ── Quincena del concurso ${P1.from}..${P1.to} (aún no se paga) ──`);
console.log(`     propinas=${money(eP1?.totalTips ?? 0)}  bono=${money(eP1?.totalContestBonus ?? 0)}`);
check("En la quincena del concurso el bono todavía no figura",
  (eP1?.contestBonuses ?? []).length === 0, `${(eP1?.contestBonuses ?? []).length} cuotas`);
check("Pero las propinas del período sí se muestran",
  (eP1?.totalTips ?? 0) > 0, money(eP1?.totalTips ?? 0));
check("Y el finalPay de esa quincena tampoco incluye las propinas",
  eP1.finalPay === Math.max(0, eP1.netPay + eP1.totalBonuses - eP1.totalDiscounts),
  `finalPay=${money(eP1.finalPay)} netPay=${money(eP1.netPay)} propinas=${money(eP1.totalTips)}`);

// ═══════════════════════════════════════════════════════════════════════════
seccion("PUNTO 4 · EL PDF NO SUMA LAS PROPINAS AL TOTAL FINAL");

for (const [etiqueta, tipo, emp, periodo] of [
  ["quincena del concurso (con propinas)", "payroll", A, P1],
  ["quincena de pago (con bono)", "payroll", A, P2],
]) {
  console.log(`\n  ── PDF · ${etiqueta} ──`);
  const rep = await api("GET", `/api/admin/reports/payroll?from=${periodo.from}&to=${periodo.to}&type=${tipo}`);
  const e = rep.data?.employees?.find(x => x.employeeId === emp.id);

  const res = await fetch(`${BASE}/api/admin/reports/payroll/export/pdf?from=${periodo.from}&to=${periodo.to}&type=${tipo}`,
    { headers: { Cookie: ch(jar) } });
  check(`PDF generado (${etiqueta})`, res.status === 200, `status=${res.status}`);
  if (res.status !== 200) continue;

  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`${TMP}/pdf-${periodo.from}.pdf`, buf);
  const frag = textoDePdf(buf);
  const texto = frag.join("\n");

  const esperadoTotal = money(e.finalPay);
  const conPropinasSumadas = money(e.finalPay + e.totalTips);

  // Se localiza el bloque del empleado y, dentro de él, la etiqueta del total.
  // Comprobar el importe que ACOMPAÑA a la etiqueta es lo único concluyente:
  // buscar el número suelto daría falsos positivos, porque el mismo importe
  // aparece legítimamente en otras líneas (p. ej. el total informativo).
  const iEmp = frag.findIndex(f => f.includes(emp.name));
  const iTot = frag.findIndex((f, k) => k > iEmp && f.includes("TOTAL FINAL A PAGAR"));
  const ventana = frag.slice(iTot, iTot + 3).join(" ⟩ ");

  console.log(`     bloque del empleado en el PDF: "${ventana}"`);
  console.log(`     finalPay esperado:          ${esperadoTotal}`);
  console.log(`     propinas (línea aparte):    ${money(e.totalTips)}`);
  console.log(`     si estuviera mal sumaría:   ${conPropinasSumadas}`);

  check(`[${etiqueta}] Se encuentra el bloque del empleado y su TOTAL FINAL A PAGAR`,
    iEmp >= 0 && iTot > iEmp, `iEmp=${iEmp} iTot=${iTot}`);
  check(`[${etiqueta}] El importe junto a TOTAL FINAL A PAGAR es finalPay (${esperadoTotal})`,
    ventana.includes(esperadoTotal), ventana);
  if (e.totalTips > 0) {
    check(`[${etiqueta}] Ese importe NO es finalPay + propinas (${conPropinasSumadas})`,
      !ventana.includes(conPropinasSumadas), ventana);
    check(`[${etiqueta}] Las propinas van en su propia línea informativa`,
      texto.includes("Propinas acumuladas") && texto.includes(money(e.totalTips)),
      `propinas=${money(e.totalTips)}`);
  }
  if (e.totalContestBonus > 0) {
    check(`[${etiqueta}] El bono de concurso va en su propia línea`,
      texto.includes("Bono concurso") && texto.includes(money(e.totalContestBonus)),
      `bono=${money(e.totalContestBonus)}`);
    check(`[${etiqueta}] El importe junto al total tampoco incluye el bono`,
      !ventana.includes(money(e.finalPay + e.totalContestBonus)) || e.totalContestBonus === 0,
      ventana);
  }
  check(`[${etiqueta}] El PDF aclara que propinas y bonos no se suman al total`,
    /no se suman al total/i.test(texto));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("REGRESIÓN · el resto del sistema sigue igual");

const repTodos = await api("GET", `/api/admin/reports/payroll?from=${P1.from}&to=${P1.to}`);
const coherentes = (repTodos.data?.employees ?? []).every(
  e => e.finalPay === Math.max(0, e.netPay + e.totalBonuses - e.totalDiscounts));
check("finalPay = netPay + bonos − descuentos para TODOS los empleados", coherentes,
  `${repTodos.data?.employees?.length ?? 0} empleados`);

const julio = await api("GET", `/api/admin/reports/payroll?from=2026-07-01&to=2026-07-15`);
const sinConcurso = (julio.data?.employees ?? []).every(e => e.totalContestBonus === 0);
check("Un período sin concursos no muestra bonos", sinConcurso);

const xls = await fetch(`${BASE}/api/admin/reports/payroll/export/excel?from=${P2.from}&to=${P2.to}`,
  { headers: { Cookie: ch(jar) } });
check("El Excel se sigue generando", xls.status === 200, `status=${xls.status}`);

const invariante = await sql(
  `SELECT COUNT(*) n FROM TipEntry WHERE ROUND(totalAmount) != ROUND(menaje + contestReserved + netAmount)`);
check("La invariante se cumple en TODA la tabla de propinas", Number(invariante[0].n) === 0,
  `${invariante[0].n} filas rotas`);

// ═══════════════════════════════════════════════════════════════════════════
seccion("LIMPIEZA");
await limpiar();
const quedan = await sql(`SELECT COUNT(*) n FROM Contest WHERE name LIKE ?`, [`${MARCA}%`]);
const empsQuedan = await sql(`SELECT COUNT(*) n FROM Employee WHERE name LIKE ?`, [`${MARCA}%`]);
check("Concursos de prueba eliminados", Number(quedan[0].n) === 0, `${quedan[0].n}`);
check("Empleados de prueba eliminados", Number(empsQuedan[0].n) === 0, `${empsQuedan[0].n}`);

console.log(`\n${"=".repeat(72)}`);
console.log(`  RESULTADO: ${pasaron} pasaron, ${fallaron} fallaron`);
if (fallos.length) { console.log("\n  Fallos:"); fallos.forEach(f => console.log(`    - ${f}`)); }
console.log("=".repeat(72));
await db.close();
process.exit(fallaron === 0 ? 0 : 1);
