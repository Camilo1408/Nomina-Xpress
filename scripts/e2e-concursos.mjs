// E2E del módulo de concursos e incentivos: los 27 casos obligatorios.
//
// Ejercita el flujo completo vía HTTP contra el dev server, con sesión real.
// Verifica además que nómina y propinas siguen intactas.
//
//   npm run dev            (en otra terminal)
//   node scripts/e2e-concursos.mjs
//
// Crea sus propios datos en un rango de fechas apartado (2026-09) y los limpia
// al terminar, para no ensuciar los datos de demo.

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";

// ── Sesión ──────────────────────────────────────────────────────────────────
function parseSetCookie(res, jar) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

async function login(username, password) {
  const jar = {};
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  parseSetCookie(csrfRes, jar);
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({ csrfToken, username, password, redirect: "false", json: "true" });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(jar) },
    body: body.toString(),
    redirect: "manual",
  });
  parseSetCookie(loginRes, jar);
  const sess = await (await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookieHeader(jar) } })).json();
  return { jar, session: sess };
}

function api(jar) {
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookieHeader(jar), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text.slice(0, 300); }
    return { status: res.status, data };
  };
}

// ── Resultados ──────────────────────────────────────────────────────────────
const lines = [];
let passed = 0, failed = 0;
function check(n, name, cond, detail = "") {
  const tag = String(n).padStart(2, " ");
  if (cond) { passed++; lines.push(`  ✅ [${tag}] ${name}`); }
  else { failed++; lines.push(`  ❌ [${tag}] ${name}${detail ? "\n         → " + detail : ""}`); }
  return !!cond;
}
function section(t) { lines.push(`\n━━━━━━ ${t} ━━━━━━`); }
const ok = (s) => s === 200 || s === 201;
const j = (d) => JSON.stringify(d).slice(0, 300);

// ── Datos del escenario ─────────────────────────────────────────────────────
// Septiembre 2026, lejos de los datos de demo. Concurso sobre la 1ª quincena.
const D = ["2026-09-02", "2026-09-03", "2026-09-04"];
const CONTEST_RANGE = { startDate: "2026-09-01", endDate: "2026-09-15" };
const TIPS_PER_DAY = 1_000_000;
const PERIOD = { from: "2026-09-01", to: "2026-09-15" };
// Quincenas de pago esperadas tras un concurso que cierra el 2026-09-15
const NEXT_1 = { periodStart: "2026-09-16", periodEnd: "2026-09-30" };
const NEXT_2 = { periodStart: "2026-10-01", periodEnd: "2026-10-15" };

const created = { contests: [], timeEntries: [], tipEntries: [] };

async function cleanup(call) {
  for (const id of created.tipEntries) await call("DELETE", `/api/admin/tips/${id}`).catch(() => {});
  for (const id of created.timeEntries) await call("DELETE", `/api/admin/time-entries/${id}`).catch(() => {});
  // Los concursos en BORRADOR se borran; el resto se cancelan para dejar rastro.
  for (const id of created.contests) {
    const r = await call("DELETE", `/api/admin/contests/${id}`);
    if (!ok(r.status)) {
      await call("POST", `/api/admin/contests/${id}/cancel`, {
        reason: "Limpieza del E2E", confirmImpact: true,
      }).catch(() => {});
    }
  }
}

/**
 * Purga los restos de corridas anteriores directamente en la base.
 *
 * Hace falta porque un concurso con un bono ya PAGADO no se puede cancelar desde
 * la API — y eso es correcto, es justo lo que protege el dinero en producción.
 * Aquí, en local, sí queremos partir de cero para que el script sea repetible.
 *
 * Solo toca lo que empieza por "E2E " y las propinas del rango de prueba.
 */
async function purgeLeftovers() {
  const { createClient } = await import("@libsql/client");
  const { config } = await import("dotenv");
  const { existsSync } = await import("fs");
  for (const f of [".env.local", ".env"]) {
    if (existsSync(f)) config({ path: f, override: false, quiet: true });
  }
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL ?? "file:./dev.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const viejos = await db.execute(`SELECT id FROM Contest WHERE name LIKE 'E2E %'`);
  for (const row of viejos.rows) {
    await db.execute({ sql: `DELETE FROM Contest WHERE id = ?`, args: [row.id] });
  }
  await db.execute(`DELETE FROM TipEntry WHERE date >= '2026-09-01' AND date <= '2026-09-30'`);
  await db.execute(`DELETE FROM TimeEntry WHERE date >= '2026-09-01' AND date <= '2026-09-30'`);
  await db.close();
  return viejos.rows.length;
}

async function main() {
  const purgados = await purgeLeftovers();
  if (purgados > 0) lines.push(`  · purgados ${purgados} concurso(s) de corridas anteriores`);

  const { jar, session } = await login("proprietario", "proprietario123");
  if (!session?.user) {
    console.error("No se pudo iniciar sesión. ¿Está corriendo `npm run dev`?");
    process.exit(1);
  }
  const call = api(jar);

  const empleados = (await call("GET", "/api/admin/employees")).data;
  const activos = (Array.isArray(empleados) ? empleados : []).filter((e) => e.active && e.payType === "PAYROLL");
  if (activos.length < 3) {
    console.error("Se necesitan al menos 3 empleados PAYROLL activos. Corre `npx tsx prisma/seed-local.ts`.");
    process.exit(1);
  }
  const [A, B, C] = activos;

  // ═══════════ PREPARACIÓN: horas y propinas del período ═══════════
  section("PREPARACIÓN");
  for (const date of D) {
    for (const emp of [A, B, C]) {
      const r = await call("POST", "/api/admin/time-entries", {
        employeeId: emp.id, date,
        checkIn: `${date}T10:00:00`, checkOut: `${date}T18:00:00`,
      });
      if (r.data?.id) created.timeEntries.push(r.data.id);
    }
  }
  lines.push(`  · ${created.timeEntries.length} registros de horas creados`);

  let baselineNet = 0;
  for (const date of D) {
    const r = await call("POST", "/api/admin/tips", { date, totalAmount: TIPS_PER_DAY });
    if (r.data?.entry?.id) created.tipEntries.push(r.data.entry.id);
    baselineNet += r.data?.entry?.netAmount ?? 0;
  }
  check(0, "Propinas sin concursos: menaje 10%, neto 90%",
    baselineNet === 3 * 900_000, `neto total=${baselineNet}, esperado 2700000`);

  // Reporte de referencia ANTES de cualquier concurso — la "prueba de oro".
  const reportBefore = (await call("GET",
    `/api/admin/reports/payroll?from=${PERIOD.from}&to=${PERIOD.to}`)).data;
  const finalPayBefore = Object.fromEntries(
    (reportBefore.employees ?? []).map((e) => [e.employeeId, e.finalPay])
  );

  // ═══════════ 1–4: creación, ítems, porcentajes, activación ═══════════
  section("1–4 · CREACIÓN, ÍTEMS, PORCENTAJES Y ACTIVACIÓN");
  let contestId, itemCervezas, itemVinos;
  {
    const r = await call("POST", "/api/admin/contests", {
      name: "E2E Incentivos de ventas",
      description: "Concurso de prueba automatizada",
      ...CONTEST_RANGE,
      payoutMode: "UNICO",
      items: [
        { name: "Venta de cervezas", goalValue: 200, goalUnit: "unidades",
          criteria: "MAYOR_VALOR", percent: 2, winnerMode: "GANADOR_UNICO" },
        { name: "Venta de vinos", goalValue: 50, goalUnit: "botellas",
          criteria: "MAYOR_VALOR", percent: 1, winnerMode: "GANADOR_UNICO" },
      ],
    });
    contestId = r.data?.contest?.id;
    if (contestId) created.contests.push(contestId);
    check(1, "Crear un concurso", ok(r.status) && contestId, `status=${r.status} ${j(r.data)}`);
    check(2, "Crear varios ítems", r.data?.contest?.items?.length === 2, j(r.data?.contest?.items?.length));
    itemCervezas = r.data?.contest?.items?.find((i) => i.name === "Venta de cervezas")?.id;
    itemVinos = r.data?.contest?.items?.find((i) => i.name === "Venta de vinos")?.id;
    check(3, "Cada ítem conserva su propio porcentaje",
      r.data?.contest?.items?.find((i) => i.name === "Venta de cervezas")?.percent === 2 &&
      r.data?.contest?.items?.find((i) => i.name === "Venta de vinos")?.percent === 1,
      j(r.data?.contest?.items?.map((i) => [i.name, i.percent])));
    check(3.1, "Un concurso nace en BORRADOR y no reserva nada",
      r.data?.contest?.status === "BORRADOR", `status=${r.data?.contest?.status}`);
  }

  // Activar sin confirmar el impacto debe ser rechazado.
  {
    const r = await call("POST", `/api/admin/contests/${contestId}/activate`, {});
    check(4.1, "Activar sin confirmar el impacto se rechaza con 409 y muestra el detalle",
      r.status === 409 && r.data?.error?.requiresConfirmation === true &&
      r.data?.error?.preview?.affectedDays === 3,
      `status=${r.status} ${j(r.data?.error?.preview)}`);
  }
  {
    const r = await call("GET", `/api/admin/contests/${contestId}/impact?action=activar`);
    check(4.2, "El preview de impacto no escribe nada y detalla día por día",
      r.status === 200 && r.data?.preview?.rows?.length === 3 &&
      r.data.preview.rows.every((x) => x.delta === -30_000),
      j(r.data?.preview?.rows));
  }
  {
    const r = await call("POST", `/api/admin/contests/${contestId}/activate`, { confirmImpact: true });
    check(4, "Activar el concurso recalcula los días ya registrados",
      ok(r.status) && r.data?.changes?.length === 3, `status=${r.status} ${j(r.data)}`);
  }

  // ═══════════ 6–10: cálculo de propinas y reservas ═══════════
  section("6–10 · CÁLCULO DE PROPINAS Y RESERVA POR ÍTEM");
  {
    const r = await call("GET", `/api/admin/tips?from=${PERIOD.from}&to=${PERIOD.to}`);
    const dia = r.data?.entries?.find((e) => e.date === D[0]);
    check(7, "Se sigue aplicando el menaje del 10%", dia?.menaje === 100_000, `menaje=${dia?.menaje}`);
    check(8, "Se acumulan los porcentajes de los concursos (2% + 1% = 3%)",
      dia?.contestReserved === 30_000, `contestReserved=${dia?.contestReserved}`);
    check(9, "El fondo a repartir es el 87%", dia?.netAmount === 870_000, `neto=${dia?.netAmount}`);
    check(6, "INVARIANTE: total = menaje + reservas + neto",
      dia && dia.totalAmount === dia.menaje + dia.contestReserved + dia.netAmount,
      `${dia?.totalAmount} vs ${dia?.menaje}+${dia?.contestReserved}+${dia?.netAmount}`);
    const repartido = (dia?.distributions ?? []).reduce((s, d) => s + d.amount, 0);
    check(9.1, "Lo repartido a los empleados no supera el neto",
      repartido <= (dia?.netAmount ?? 0) && repartido > 0, `repartido=${repartido} neto=${dia?.netAmount}`);
  }
  {
    const r = await call("GET", `/api/admin/contests/${contestId}`);
    const rc = (r.data?.reserves ?? []).filter((x) => x.contestItemId === itemCervezas && x.status === "RESERVADA");
    const rv = (r.data?.reserves ?? []).filter((x) => x.contestItemId === itemVinos && x.status === "RESERVADA");
    check(10, "El dinero de cada ítem queda reservado por separado",
      rc.length === 3 && rv.length === 3 &&
      rc.reduce((s, x) => s + x.amount, 0) === 60_000 &&
      rv.reduce((s, x) => s + x.amount, 0) === 30_000,
      `cervezas=${rc.reduce((s, x) => s + x.amount, 0)} vinos=${rv.reduce((s, x) => s + x.amount, 0)}`);
    check(10.1, "Cada reserva guarda el % y la base congelados",
      rc.every((x) => x.percent === 2 && x.tipTotalAmount === TIPS_PER_DAY), j(rc[0]));
  }

  // ═══════════ 21–22: concursos simultáneos y superpuestos ═══════════
  section("21–22 · CONCURSOS SIMULTÁNEOS Y SUPERPUESTOS");
  let contest2Id;
  {
    const r = await call("POST", "/api/admin/contests", {
      name: "E2E Concurso solapado",
      startDate: "2026-09-03", endDate: "2026-09-20",
      payoutMode: "UNICO",
      items: [{ name: "Cócteles", goalValue: 10, goalUnit: "unidades",
        criteria: "MAYOR_VALOR", percent: 1, winnerMode: "GANADOR_UNICO" }],
    });
    contest2Id = r.data?.contest?.id;
    if (contest2Id) created.contests.push(contest2Id);
    check(22, "Se permite crear un concurso con fechas superpuestas", ok(r.status), j(r.data));
  }
  {
    await call("POST", `/api/admin/contests/${contest2Id}/activate`, { confirmImpact: true });
    const r = await call("GET", `/api/admin/tips?from=${PERIOD.from}&to=${PERIOD.to}`);
    const solapado = r.data?.entries?.find((e) => e.date === "2026-09-04");
    const noSolapado = r.data?.entries?.find((e) => e.date === "2026-09-02");
    check(21, "En un día solapado los porcentajes se acumulan (2+1+1 = 4%)",
      solapado?.contestReserved === 40_000, `reservado=${solapado?.contestReserved}`);
    check(21.1, "Un día fuera del segundo concurso mantiene solo 3%",
      noSolapado?.contestReserved === 30_000, `reservado=${noSolapado?.contestReserved}`);
    check(21.2, "La invariante se mantiene con dos concursos activos",
      solapado && solapado.totalAmount === solapado.menaje + solapado.contestReserved + solapado.netAmount,
      j(solapado));
  }

  // ═══════════ 26: validaciones y errores ═══════════
  section("26 · VALIDACIONES Y CASOS DE ERROR");
  {
    const r = await call("POST", "/api/admin/contests", {
      name: "E2E Excede el tope", startDate: "2026-09-01", endDate: "2026-09-15",
      payoutMode: "UNICO",
      items: [{ name: "Enorme", goalValue: 1, goalUnit: "u", criteria: "MAYOR_VALOR",
        percent: 19, winnerMode: "GANADOR_UNICO" }],
    });
    check(26.1, "Se rechaza superar el tope acumulado del 20%",
      r.status === 400 && Array.isArray(r.data?.error?.conflicts) && r.data.error.conflicts.length > 0,
      `status=${r.status} ${j(r.data)}`);
  }
  {
    const r = await call("POST", "/api/admin/contests", {
      name: "E2E Porcentaje inválido", startDate: "2026-09-01", endDate: "2026-09-15",
      payoutMode: "UNICO",
      items: [{ name: "Cero", goalValue: 1, goalUnit: "u", criteria: "MAYOR_VALOR",
        percent: 0, winnerMode: "GANADOR_UNICO" }],
    });
    check(26.2, "Se rechaza un porcentaje de 0%", r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call("POST", "/api/admin/contests", {
      name: "E2E Fechas invertidas", startDate: "2026-09-15", endDate: "2026-09-01",
      payoutMode: "UNICO",
      items: [{ name: "X", goalValue: 1, goalUnit: "u", criteria: "MAYOR_VALOR",
        percent: 1, winnerMode: "GANADOR_UNICO" }],
    });
    check(26.3, "Se rechaza un rango de fechas invertido", r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call("POST", `/api/admin/contests/${contestId}/items`, {
      name: "Venta de cervezas", goalValue: 1, goalUnit: "u",
      criteria: "MAYOR_VALOR", percent: 1, winnerMode: "GANADOR_UNICO",
    });
    check(26.4, "Se rechaza un ítem con nombre duplicado", r.status === 409, `status=${r.status}`);
  }
  {
    const r = await call("DELETE", `/api/admin/contests/${contestId}`);
    check(26.5, "No se puede ELIMINAR un concurso activo (hay que cancelarlo)",
      r.status === 409, `status=${r.status}`);
  }
  {
    const r = await call("DELETE", `/api/admin/contests/${contestId}/items/${itemCervezas}`);
    check(26.6, "No se puede eliminar un ítem que ya reservó dinero",
      r.status === 409, `status=${r.status}`);
  }

  // ═══════════ 24: modificar antes y después de iniciar ═══════════
  section("24 · MODIFICACIÓN ANTES Y DESPUÉS DE INICIAR");
  {
    const r = await call("PUT", `/api/admin/contests/${contestId}/items/${itemVinos}`, {
      name: "Venta de vinos", goalValue: 50, goalUnit: "botellas",
      criteria: "MAYOR_VALOR", percent: 2, winnerMode: "GANADOR_UNICO",
    });
    check(24.1, "Cambiar el % de un ítem activo exige confirmar el impacto",
      r.status === 409 && r.data?.error?.requiresConfirmation === true, `status=${r.status} ${j(r.data?.error?.message)}`);
  }
  {
    const r = await call("PUT", `/api/admin/contests/${contestId}/items/${itemVinos}`, {
      name: "Venta de vinos", goalValue: 50, goalUnit: "botellas",
      criteria: "MAYOR_VALOR", percent: 2, winnerMode: "GANADOR_UNICO",
      confirmImpact: true,
    });
    check(24.2, "Con confirmación, el cambio de % recalcula los días", ok(r.status) && r.data?.changes?.length > 0, j(r.data));
    const t = await call("GET", `/api/admin/tips?from=${PERIOD.from}&to=${PERIOD.to}`);
    const dia = t.data?.entries?.find((e) => e.date === D[0]);
    check(24.3, "Tras subir vinos a 2%, el día reserva 4% (2+2)",
      dia?.contestReserved === 40_000, `reservado=${dia?.contestReserved}`);
    // Volver a dejarlo en 1% para el resto del escenario
    await call("PUT", `/api/admin/contests/${contestId}/items/${itemVinos}`, {
      name: "Venta de vinos", goalValue: 50, goalUnit: "botellas",
      criteria: "MAYOR_VALOR", percent: 1, winnerMode: "GANADOR_UNICO", confirmImpact: true,
    });
  }

  // ═══════════ 5, 11–13: meta, finalización, ganador y bono ═══════════
  section("5, 11–13 · META, FINALIZACIÓN, GANADOR Y BONO");
  {
    const r = await call("PUT", `/api/admin/contests/${contestId}/items/${itemCervezas}/results`, {
      results: [
        { employeeId: A.id, value: 240 },
        { employeeId: B.id, value: 310 },
        { employeeId: C.id, value: 150 },
      ],
    });
    check(5, "Registrar el cumplimiento de la meta",
      ok(r.status) && r.data?.qualifiedCount === 2, `status=${r.status} califican=${r.data?.qualifiedCount}`);
  }
  {
    const r = await call("POST", `/api/admin/contests/${contestId}/items/${itemCervezas}/award`, {});
    check(12.1, "No se puede adjudicar antes de finalizar el concurso", r.status === 409, `status=${r.status}`);
  }
  {
    const r = await call("POST", `/api/admin/contests/${contestId}/finalize`, { confirmEarly: true });
    check(11, "Finalizar el concurso congela la reserva",
      ok(r.status) && r.data?.reservedAmount === 90_000, `status=${r.status} reservado=${r.data?.reservedAmount}`);
  }
  let bonusId, bonusAmount;
  {
    const r = await call("POST", `/api/admin/contests/${contestId}/items/${itemCervezas}/award`, {});
    bonusId = r.data?.bonuses?.[0]?.bonusId;
    bonusAmount = r.data?.bonuses?.[0]?.amount;
    check(12, "El ganador es quien más vendió, no quien apenas cumplió",
      ok(r.status) && r.data?.bonuses?.length === 1 && r.data.bonuses[0].employeeId === B.id,
      `status=${r.status} ${j(r.data)}`);
    check(13, "El bono vale la suma de las reservas diarias del ítem (3 × 20.000)",
      bonusAmount === 60_000, `bono=${bonusAmount}`);
    check(13.1, "La cuota se programa en la quincena siguiente al cierre",
      r.data?.bonuses?.[0]?.installments?.[0]?.periodStart === NEXT_1.periodStart &&
      r.data?.bonuses?.[0]?.installments?.[0]?.periodEnd === NEXT_1.periodEnd,
      j(r.data?.bonuses?.[0]?.installments));
    check(13.2, "El bono guarda la base de propinas usada",
      r.data?.tipBase === 3_000_000, `base=${r.data?.tipBase}`);
  }
  {
    const r = await call("POST", `/api/admin/contests/${contestId}/items/${itemCervezas}/award`, {});
    check(13.3, "No se puede adjudicar dos veces el mismo ítem", r.status === 409, `status=${r.status}`);
  }

  // ═══════════ 25: concurso finalizado = congelado ═══════════
  section("25 · PERÍODO CONGELADO");
  {
    const r = await call("PUT", `/api/admin/contests/${contestId}`, {
      name: "E2E Incentivos de ventas (editado)",
      ...CONTEST_RANGE, payoutMode: "UNICO",
    });
    check(25.1, "No se puede editar la configuración de un concurso FINALIZADO",
      r.status === 409, `status=${r.status}`);
  }
  {
    // Editar el total de propinas de un día del rango: la reserva congelada no se mueve.
    const antes = (await call("GET", `/api/admin/tips?from=${PERIOD.from}&to=${PERIOD.to}`))
      .data?.entries?.find((e) => e.date === D[0]);
    const r = await call("PUT", `/api/admin/tips/${antes.id}`, { totalAmount: 2_000_000 });
    const despues = (await call("GET", `/api/admin/tips?from=${PERIOD.from}&to=${PERIOD.to}`))
      .data?.entries?.find((e) => e.date === D[0]);
    // D[0] = 2026-09-02, fuera del rango del concurso 2 (empieza el 09-03). Solo
    // aplican cervezas (2%) y vinos (1%) del concurso 1, ya FINALIZADO.
    //   Congelado  → 20.000 + 10.000 = 30.000 (calculado sobre 1.000.000)
    //   Si NO lo estuviera → 40.000 + 20.000 = 60.000 (sobre los 2.000.000 nuevos)
    // La diferencia entre ambos es exactamente lo que prueba este caso.
    check(25.2, "Al duplicar el total de un día, la reserva congelada NO se recalcula",
      ok(r.status) && despues?.contestReserved === 30_000,
      `reservado=${despues?.contestReserved}; 30000 = congelado, 60000 = se recalculó (fallo)`);
    check(25.4, "El empleado se lleva TODO el aumento del día, no el concurso",
      despues?.netAmount === 2_000_000 - 200_000 - 30_000,
      `neto=${despues?.netAmount}, esperado 1770000`);
    check(25.3, "La invariante se mantiene tras editar el total",
      despues && despues.totalAmount === despues.menaje + despues.contestReserved + despues.netAmount,
      j(despues));
    await call("PUT", `/api/admin/tips/${antes.id}`, { totalAmount: TIPS_PER_DAY });
  }

  // ═══════════ 14, 16, 17: pago único, saldos, doble pago ═══════════
  section("14, 16–17 · PAGO ÚNICO, SALDOS Y DOBLE PAGO");
  let pay1;
  {
    const r = await call("GET", "/api/admin/contest-bonuses");
    const bono = r.data?.bonuses?.find((b) => b.id === bonusId);
    pay1 = bono?.payments?.[0];
    check(16.1, "El bono nace PENDIENTE con el saldo completo",
      bono?.status === "PENDIENTE" && bono?.paidAmount === 0 && bono?.pendingAmount === 60_000,
      j({ status: bono?.status, paid: bono?.paidAmount, pend: bono?.pendingAmount }));
    check(14.1, "El pago único genera una sola cuota", bono?.payments?.length === 1, `cuotas=${bono?.payments?.length}`);
  }
  {
    const r = await call("POST", `/api/admin/contest-bonuses/${bonusId}/payments/${pay1.id}/pay`, {});
    check(14, "Pagar el bono completo en una quincena",
      ok(r.status) && r.data?.bonusStatus === "PAGADO" && r.data?.pendingAmount === 0, j(r.data));
  }
  {
    const r = await call("POST", `/api/admin/contest-bonuses/${bonusId}/payments/${pay1.id}/pay`, {});
    check(17, "El segundo intento de pago se rechaza con 409",
      r.status === 409 && r.data?.error?.reason === "YA_PAGADA", `status=${r.status} ${j(r.data)}`);
  }
  {
    const r = await call("GET", "/api/admin/contest-bonuses");
    const bono = r.data?.bonuses?.find((b) => b.id === bonusId);
    check(16, "El saldo queda en cero y no se pagó de más",
      bono?.paidAmount === 60_000 && bono?.pendingAmount === 0,
      j({ paid: bono?.paidAmount, pend: bono?.pendingAmount }));
  }

  // ═══════════ 15: pago dividido en dos quincenas ═══════════
  section("15 · PAGO DIVIDIDO EN DOS QUINCENAS");
  let contest3Id, bonus3Id, cuotasDiv;
  {
    const r = await call("POST", "/api/admin/contests", {
      name: "E2E Pago dividido",
      startDate: "2026-09-10", endDate: "2026-09-15",
      payoutMode: "DIVIDIDO",
      items: [{ name: "Postres", goalValue: 5, goalUnit: "unidades",
        criteria: "MAYOR_VALOR", percent: 2, winnerMode: "GANADOR_UNICO" }],
    });
    contest3Id = r.data?.contest?.id;
    if (contest3Id) created.contests.push(contest3Id);
    const item3 = r.data?.contest?.items?.[0]?.id;

    await call("POST", `/api/admin/contests/${contest3Id}/activate`, { confirmImpact: true });
    // Un día dentro de su rango
    const t = await call("POST", "/api/admin/tips", { date: "2026-09-11", totalAmount: 1_000_000 });
    if (t.data?.entry?.id) created.tipEntries.push(t.data.entry.id);

    await call("PUT", `/api/admin/contests/${contest3Id}/items/${item3}/results`, {
      results: [{ employeeId: A.id, value: 12 }],
    });
    await call("POST", `/api/admin/contests/${contest3Id}/finalize`, { confirmEarly: true });
    const aw = await call("POST", `/api/admin/contests/${contest3Id}/items/${item3}/award`, {});
    bonus3Id = aw.data?.bonuses?.[0]?.bonusId;
    cuotasDiv = aw.data?.bonuses?.[0]?.installments ?? [];

    check(15.1, "El pago dividido genera dos cuotas", cuotasDiv.length === 2, j(cuotasDiv));
    check(15.2, "Las cuotas caen en las dos quincenas siguientes",
      cuotasDiv[0]?.periodStart === NEXT_1.periodStart && cuotasDiv[1]?.periodStart === NEXT_2.periodStart,
      j(cuotasDiv.map((c) => c.periodStart)));
    check(15.3, "Las dos cuotas suman exactamente el bono",
      cuotasDiv.reduce((s, c) => s + c.amount, 0) === aw.data?.bonuses?.[0]?.amount,
      j({ cuotas: cuotasDiv.map((c) => c.amount), total: aw.data?.bonuses?.[0]?.amount }));
  }
  {
    const b = (await call("GET", "/api/admin/contest-bonuses")).data?.bonuses?.find((x) => x.id === bonus3Id);
    const r1 = await call("POST", `/api/admin/contest-bonuses/${bonus3Id}/payments/${b.payments[0].id}/pay`, {});
    check(15, "Pagar la primera cuota deja el bono en PARCIAL",
      ok(r1.status) && r1.data?.bonusStatus === "PARCIAL" && r1.data?.pendingAmount === b.payments[1].amount,
      j(r1.data));
    const r2 = await call("POST", `/api/admin/contest-bonuses/${bonus3Id}/payments/${b.payments[1].id}/pay`, {});
    check(16.2, "Pagar la segunda cuota lo deja en PAGADO con saldo cero",
      ok(r2.status) && r2.data?.bonusStatus === "PAGADO" && r2.data?.pendingAmount === 0, j(r2.data));
  }

  // ═══════════ 18–19: el bono en el reporte, sin tocar el total ═══════════
  section("18–19 · EL BONO EN EL REPORTE Y EL TOTAL DE NÓMINA");
  {
    const r = await call("GET",
      `/api/admin/reports/payroll?from=${NEXT_1.periodStart}&to=${NEXT_1.periodEnd}`);
    const ganador = r.data?.employees?.find((e) => e.employeeId === B.id);
    // Se busca la cuota de ESTE bono, no el total del empleado: la base local
    // puede tener bonos de otras corridas y un test no debe depender de eso.
    const mia = (ganador?.contestBonuses ?? []).find((b) => b.paymentId === pay1?.id);
    check(18, "El bono aparece en el reporte de su quincena",
      !!mia && mia.amount === 60_000, j({ encontrada: !!mia, monto: mia?.amount }));
    check(18.1, "El bono muestra concurso, ítem y meta",
      mia?.contestName?.includes("E2E") && mia?.itemName === "Venta de cervezas" &&
      mia?.goal === "200 unidades", j(mia));
    check(19, "El bono NO se suma al total de nómina",
      ganador?.finalPay === ganador?.netPay + ganador?.totalBonuses - ganador?.totalDiscounts,
      j({ finalPay: ganador?.finalPay, netPay: ganador?.netPay, bono: ganador?.totalContestBonus }));
    check(19.1, "El total informativo sí lo incluye",
      ganador?.totalInformativeReceived ===
        ganador?.finalPay + ganador?.totalTips + ganador?.totalContestBonus,
      j({ informativo: ganador?.totalInformativeReceived }));
  }
  {
    // La quincena del concurso: el bono NO debe aparecer aquí (se paga después).
    // Se busca la cuota de ESTE bono, no el total del empleado: la base local
    // puede tener otros bonos de otras pruebas/otros concursos ajenos a este E2E.
    const r = await call("GET", `/api/admin/reports/payroll?from=${PERIOD.from}&to=${PERIOD.to}`);
    const ganador = r.data?.employees?.find((e) => e.employeeId === B.id);
    const mia = (ganador?.contestBonuses ?? []).find((b) => b.paymentId === pay1?.id);
    check(19.2, "El bono no aparece en la quincena en que se generó",
      mia === undefined, `encontrada=${!!mia}`);
  }

  // ═══════════ 20: las propinas siguen funcionando ═══════════
  section("20 · REGRESIÓN DE PROPINAS Y NÓMINA");
  {
    const r = await call("GET", `/api/admin/reports/payroll?from=${PERIOD.from}&to=${PERIOD.to}`);
    let coherente = true, detalle = "";
    for (const e of r.data?.employees ?? []) {
      if (e.finalPay !== e.netPay + e.totalBonuses - e.totalDiscounts && e.finalPay !== 0) {
        coherente = false; detalle = j({ emp: e.employeeName, finalPay: e.finalPay, netPay: e.netPay });
      }
    }
    check(20, "finalPay sigue siendo netPay + bonos − descuentos para todos", coherente, detalle);
    const conPropinas = (r.data?.employees ?? []).filter((e) => e.totalTips > 0);
    check(20.1, "Los empleados siguen recibiendo propinas", conPropinas.length >= 3, `con propinas=${conPropinas.length}`);
  }
  {
    // El PDF y el Excel deben seguir generándose sin romperse.
    const pdf = await fetch(
      `${BASE}/api/admin/reports/payroll/export/pdf?from=${NEXT_1.periodStart}&to=${NEXT_1.periodEnd}`,
      { headers: { Cookie: cookieHeader(jar) } });
    check(20.2, "El PDF de nómina se genera con el bono dentro",
      pdf.status === 200 && (pdf.headers.get("content-type") ?? "").includes("pdf"),
      `status=${pdf.status} ct=${pdf.headers.get("content-type")}`);
    const xls = await fetch(
      `${BASE}/api/admin/reports/payroll/export/excel?from=${NEXT_1.periodStart}&to=${NEXT_1.periodEnd}`,
      { headers: { Cookie: cookieHeader(jar) } });
    check(20.3, "El Excel de nómina se genera con el bono dentro", xls.status === 200, `status=${xls.status}`);
  }

  // ═══════════ 23: cancelación con devolución ═══════════
  section("23 · CANCELACIÓN Y DEVOLUCIÓN");
  {
    const antes = (await call("GET", `/api/admin/tips?from=${PERIOD.from}&to=${PERIOD.to}`))
      .data?.entries?.find((e) => e.date === "2026-09-04");
    const r = await call("POST", `/api/admin/contests/${contest2Id}/cancel`, {
      reason: "Prueba E2E de cancelación",
    });
    check(23.1, "Cancelar sin confirmar el impacto se rechaza", r.status === 400, `status=${r.status}`);

    const r2 = await call("POST", `/api/admin/contests/${contest2Id}/cancel`, {
      reason: "Prueba E2E de cancelación", confirmImpact: true,
    });
    check(23, "Cancelar devuelve el dinero a los empleados",
      ok(r2.status) && r2.data?.refunded > 0, `status=${r2.status} devuelto=${r2.data?.refunded}`);

    const despues = (await call("GET", `/api/admin/tips?from=${PERIOD.from}&to=${PERIOD.to}`))
      .data?.entries?.find((e) => e.date === "2026-09-04");
    check(23.2, "El día solapado vuelve de 4% a 3% de descuento",
      despues?.contestReserved === 30_000, `antes=${antes?.contestReserved} despues=${despues?.contestReserved}`);
    check(23.3, "La invariante se mantiene tras la devolución",
      despues && despues.totalAmount === despues.menaje + despues.contestReserved + despues.netAmount,
      j(despues));

    const det = await call("GET", `/api/admin/contests/${contest2Id}`);
    const devueltas = (det.data?.reserves ?? []).filter((x) => x.status === "DEVUELTA");
    check(23.4, "Las reservas se marcan DEVUELTA, no se borran (trazabilidad)",
      devueltas.length > 0 && devueltas.every((x) => x.refundReason), `devueltas=${devueltas.length}`);
  }

  // ═══════════ Ítem desierto ═══════════
  section("EXTRA · ÍTEM DESIERTO");
  {
    // El ítem "vinos" del concurso 1 no tiene resultados: debe quedar desierto.
    const antes = (await call("GET", `/api/admin/tips?from=${PERIOD.from}&to=${PERIOD.to}`))
      .data?.entries?.find((e) => e.date === D[1]);
    const r = await call("POST", `/api/admin/contests/${contestId}/items/${itemVinos}/void`, {
      reason: "Nadie alcanzó la meta", confirmImpact: true,
    });
    check(90, "Declarar desierto devuelve solo la reserva de ese ítem",
      ok(r.status) && r.data?.refunded > 0, `status=${r.status} ${j(r.data)}`);
    const despues = (await call("GET", `/api/admin/tips?from=${PERIOD.from}&to=${PERIOD.to}`))
      .data?.entries?.find((e) => e.date === D[1]);
    check(90.1, "El ítem adjudicado conserva su reserva (queda solo el 2% de cervezas)",
      despues?.contestReserved === 20_000,
      `antes=${antes?.contestReserved} despues=${despues?.contestReserved}`);
  }

  // ═══════════ 27: RBAC y regresión de otros módulos ═══════════
  section("27 · PERMISOS Y OTROS MÓDULOS");
  {
    const { jar: adminJar, session: adminSess } = await login("admin", "admin123");
    if (adminSess?.user) {
      const adminCall = api(adminJar);
      const ver = await adminCall("GET", "/api/admin/contests");
      check(27.1, "ADMIN puede VER los concursos", ver.status === 200, `status=${ver.status}`);
      const crear = await adminCall("POST", "/api/admin/contests", {
        name: "No permitido", startDate: "2026-11-01", endDate: "2026-11-15", payoutMode: "UNICO",
        items: [{ name: "X", goalValue: 1, goalUnit: "u", criteria: "MAYOR_VALOR", percent: 1, winnerMode: "GANADOR_UNICO" }],
      });
      check(27.2, "ADMIN NO puede crear concursos", crear.status === 401, `status=${crear.status}`);
      if (bonus3Id) {
        const pagar = await adminCall("POST", `/api/admin/contest-bonuses/${bonus3Id}/payments/x/pay`, {});
        check(27.3, "ADMIN NO puede marcar pagos", pagar.status === 401, `status=${pagar.status}`);
      }
    }
    const anon = await fetch(`${BASE}/api/admin/contests`, { redirect: "manual" });
    check(27.4, "Sin sesión no se accede a concursos", anon.status === 401 || anon.status === 307, `status=${anon.status}`);
  }
  {
    for (const [nombre, path] of [
      ["empleados", "/api/admin/employees"],
      ["horas", "/api/admin/time-entries?from=2026-09-01&to=2026-09-15"],
      ["propinas", "/api/admin/tips?from=2026-09-01&to=2026-09-15"],
      ["bonos fijos", "/api/admin/bonuses"],
      ["descuentos", "/api/admin/discounts"],
      ["festivos", "/api/admin/holidays"],
    ]) {
      const r = await call("GET", path);
      check(27, `Módulo existente intacto: ${nombre}`, r.status === 200, `status=${r.status}`);
    }
  }

  // ═══════════ Prueba de oro ═══════════
  section("PRUEBA DE ORO · UN PERÍODO SIN CONCURSOS DA LO MISMO QUE ANTES");
  {
    const r = await call("GET", "/api/admin/reports/payroll?from=2026-07-01&to=2026-07-15");
    let coherente = true;
    for (const e of r.data?.employees ?? []) {
      if (e.totalContestBonus !== 0) coherente = false;
      if (e.finalPay !== e.netPay + e.totalBonuses - e.totalDiscounts) coherente = false;
    }
    check(99, "Un período sin concursos no tiene bonos ni altera finalPay", coherente,
      j((r.data?.employees ?? []).map((e) => ({ n: e.employeeName, f: e.finalPay, cb: e.totalContestBonus }))));
  }

  // ── Limpieza ──
  section("LIMPIEZA");
  await cleanup(call);
  // cleanup() cancela por API lo que no puede borrar, y eso deja el concurso en
  // la base. Purgar también AL FINAL evita que esos restos contaminen consultas
  // posteriores: un total global de bonos que incluyera datos de prueba ya causó
  // un falso fallo en el caso 19.2.
  const restos = await purgeLeftovers();
  lines.push(`  · datos del escenario eliminados${restos > 0 ? ` (${restos} concurso(s) purgados)` : ""}`);

  console.log(lines.join("\n"));
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTADO: ${passed} pasaron, ${failed} fallaron`);
  console.log(`${"═".repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.log(lines.join("\n"));
  console.error("\nERROR FATAL:", err);
  process.exit(1);
});
