// Prueba de integración completa del sistema vía HTTP.
// Ejercita CREATE/READ/UPDATE/DELETE en todos los módulos y verifica RBAC.
// Ejecutar con el dev server corriendo en localhost:3000:
//   node scripts/e2e-full-test.mjs

const BASE = "http://localhost:3000";

// ── Utilidades de cookies/sesión ────────────────────────────────────────────
function parseSetCookie(res, jar) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    jar[name] = val;
  }
}
function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login(username, password) {
  const jar = {};
  // 1. CSRF
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  parseSetCookie(csrfRes, jar);
  const { csrfToken } = await csrfRes.json();
  // 2. callback credentials
  const body = new URLSearchParams({ csrfToken, username, password, redirect: "false", json: "true" });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(jar) },
    body: body.toString(),
    redirect: "manual",
  });
  parseSetCookie(loginRes, jar);
  // 3. verificar sesión
  const sessRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookieHeader(jar) } });
  const sess = await sessRes.json();
  return { jar, session: sess };
}

function api(jar) {
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Cookie: cookieHeader(jar),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
    return { status: res.status, data };
  };
}

// ── Registro de resultados ──────────────────────────────────────────────────
const results = [];
let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed++; results.push(`  ✅ ${name}`); }
  else { failed++; results.push(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
}
function section(title) { results.push(`\n━━━ ${title} ━━━`); }
// Crear puede devolver 200 o 201 (Created), ambos correctos en REST.
const ok = (s) => s === 200 || s === 201;

// ── Main ────────────────────────────────────────────────────────────────────
const period = { from: "2026-06-16", to: "2026-06-30" };

async function main() {
  // === LOGIN PROPRIETARY ===
  const { jar, session } = await login("SadminJavier", "Javier123");
  if (session?.user?.role !== "PROPRIETARY") {
    console.error("No se pudo iniciar sesión como PROPRIETARY. Sesión:", session);
    process.exit(1);
  }
  const call = api(jar);

  // ═══════════════════════════ EMPLEADOS ═══════════════════════════
  section("EMPLEADOS");
  let empId;
  {
    const r = await call("POST", "/api/admin/employees", {
      name: "Empleado Prueba E2E", documentId: "99999", phone: "3000000000",
      hourlyRateNormal: 7000, hourlyRateSpecial: 12000, tipPercent: 80,
      payType: "PAYROLL", accessRole: "NONE",
    });
    check("Crear empleado", ok(r.status) && r.data?.id, `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
    empId = r.data?.id;
  }
  {
    const r = await call("GET", "/api/admin/employees");
    check("Listar empleados", r.status === 200 && Array.isArray(r.data) && r.data.length >= 5, `count=${Array.isArray(r.data)?r.data.length:'?'}`);
  }
  if (empId) {
    const r = await call("PUT", `/api/admin/employees/${empId}`, { name: "Empleado E2E Editado", hourlyRateNormal: 7500 });
    check("Editar empleado", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
  }
  // Crear credenciales para el empleado
  if (empId) {
    const r = await call("POST", `/api/admin/employees/${empId}/credentials`, { username: "e2euser", password: "e2epass123", role: "EMPLOYEE" });
    check("Crear credenciales de empleado", ok(r.status) && (r.data?.success || r.data?.id), `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
  }
  // Toggle inventory access
  if (empId) {
    const r = await call("PATCH", `/api/admin/employees/${empId}/inventory-access`, { inventoryAccess: true });
    check("Habilitar acceso a inventario", r.status === 200 && r.data?.inventoryAccess === true, `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
  }
  // Desactivar empleado
  if (empId) {
    const r = await call("PUT", `/api/admin/employees/${empId}`, { active: false });
    check("Desactivar empleado", r.status === 200, `status=${r.status}`);
  }

  // ═══════════════════════════ REGISTRO DE HORAS ═══════════════════════════
  section("REGISTRO DE HORAS");
  // Necesitamos un empleado activo pagable — buscamos uno del seed
  const empList = (await call("GET", "/api/admin/employees")).data;
  const seedEmp = Array.isArray(empList) ? empList.find(e => e.active && e.name.includes("Cesar")) : null;
  let timeEntryId;
  if (seedEmp) {
    const r = await call("POST", "/api/admin/time-entries", {
      employeeId: seedEmp.id, date: "2026-06-28",
      checkIn: "2026-06-28T08:00:00", checkOut: "2026-06-28T16:00:00",
    });
    check("Crear registro de horas", ok(r.status) && r.data?.id, `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
    timeEntryId = r.data?.id;
  } else {
    check("Crear registro de horas", false, "no se encontró empleado seed Cesar");
  }
  // Validación: salida antes de entrada → debe fallar (400)
  if (seedEmp) {
    const r = await call("POST", "/api/admin/time-entries", {
      employeeId: seedEmp.id, date: "2026-06-29",
      checkIn: "2026-06-29T16:00:00", checkOut: "2026-06-29T08:00:00",
    });
    check("Rechazar salida anterior a entrada (validación)", r.status === 400, `status=${r.status} (esperado 400)`);
  }
  // Validación: solapamiento → debe fallar
  if (seedEmp && timeEntryId) {
    const r = await call("POST", "/api/admin/time-entries", {
      employeeId: seedEmp.id, date: "2026-06-28",
      checkIn: "2026-06-28T10:00:00", checkOut: "2026-06-28T12:00:00",
    });
    check("Rechazar solapamiento de horarios (validación)", r.status === 400 || r.status === 409, `status=${r.status} (esperado 400/409)`);
  }
  if (timeEntryId) {
    const r = await call("PUT", `/api/admin/time-entries/${timeEntryId}`, { checkOut: "2026-06-28T17:00:00" });
    check("Editar registro de horas", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
  }
  if (timeEntryId) {
    const r = await call("DELETE", `/api/admin/time-entries/${timeEntryId}`);
    check("Borrar registro de horas", r.status === 200, `status=${r.status}`);
  }

  // ═══════════════════════════ HORARIOS ═══════════════════════════
  section("HORARIOS");
  let scheduleId;
  if (seedEmp) {
    const r = await call("POST", "/api/admin/schedules", {
      name: "Horario E2E", weekStart: "2026-06-28",
      shifts: [{ employeeId: seedEmp.id, date: "2026-06-28", startTime: "08:00", endTime: "16:00" }],
    });
    check("Crear horario", ok(r.status) && r.data?.id, `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
    scheduleId = r.data?.id;
  }
  if (scheduleId) {
    const r = await call("POST", `/api/admin/schedules/${scheduleId}/publish`);
    check("Publicar horario", r.status === 200 && r.data?.published === true, `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
  }
  if (scheduleId) {
    const r = await call("PUT", `/api/admin/schedules/${scheduleId}`, {
      name: "Horario E2E Editado", weekStart: "2026-06-28",
      shifts: [{ employeeId: seedEmp.id, date: "2026-06-29", startTime: "09:00", endTime: "17:00" }],
    });
    check("Editar horario", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
  }
  if (scheduleId) {
    const r = await call("DELETE", `/api/admin/schedules/${scheduleId}`);
    check("Borrar horario", r.status === 200, `status=${r.status}`);
  }

  // ═══════════════════════════ PROPINAS ═══════════════════════════
  section("PROPINAS");
  let tipId;
  {
    const r = await call("POST", "/api/admin/tips", { date: "2026-06-24", totalAmount: 300000, notes: "Propina E2E" });
    const id = r.data?.entry?.id ?? r.data?.id;
    check("Crear propina", ok(r.status) && id, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
    tipId = id;
  }
  {
    const r = await call("GET", `/api/admin/tips?from=${period.from}&to=${period.to}`);
    check("Listar propinas", r.status === 200 && Array.isArray(r.data?.entries ?? r.data), `status=${r.status}`);
  }
  if (tipId) {
    const r = await call("PUT", `/api/admin/tips/${tipId}`, { totalAmount: 350000, notes: "Propina E2E editada" });
    check("Editar propina (recalcula distribución)", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
  }
  if (tipId) {
    const r = await call("DELETE", `/api/admin/tips/${tipId}`);
    check("Borrar propina", r.status === 200, `status=${r.status}`);
  }
  // Validación: propina duplicada misma fecha
  {
    const r1 = await call("POST", "/api/admin/tips", { date: "2026-06-25", totalAmount: 100000 });
    const r2 = await call("POST", "/api/admin/tips", { date: "2026-06-25", totalAmount: 200000 });
    check("Rechazar propina duplicada misma fecha", r2.status >= 400, `status r2=${r2.status} (esperado >=400)`);
    const r1id = r1.data?.entry?.id ?? r1.data?.id;
    if (r1id) await call("DELETE", `/api/admin/tips/${r1id}`);
  }

  // ═══════════════════════════ AJUSTES DE PAGO ═══════════════════════════
  section("AJUSTES DE PAGO");
  let adjId;
  if (seedEmp) {
    const r = await call("POST", "/api/admin/pay-adjustments", {
      employeeId: seedEmp.id, type: "BONUS", amount: 50000,
      description: "Ajuste E2E", periodStart: period.from, periodEnd: period.to,
    });
    check("Crear ajuste de pago", ok(r.status) && r.data?.id, `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
    adjId = r.data?.id;
  }
  if (adjId) {
    const r = await call("DELETE", `/api/admin/pay-adjustments/${adjId}`);
    check("Borrar ajuste de pago", r.status === 200, `status=${r.status}`);
  }

  // ═══════════════════════════ BONOS ═══════════════════════════
  section("BONOS");
  let bonusId;
  {
    const r = await call("POST", "/api/admin/bonuses", {
      name: "Bono E2E", valueType: "STANDARD", amount: 30000,
      assignmentType: "ALL", frequency: "BIWEEKLY", assignments: [],
    });
    check("Crear bono", ok(r.status) && r.data?.id, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
    bonusId = r.data?.id;
  }
  {
    const r = await call("GET", "/api/admin/bonuses");
    check("Listar bonos", r.status === 200 && Array.isArray(r.data), `status=${r.status}`);
  }
  if (bonusId) {
    const r = await call("PUT", `/api/admin/bonuses/${bonusId}`, {
      name: "Bono E2E Editado", valueType: "STANDARD", amount: 40000,
      assignmentType: "PAYROLL", frequency: "BIWEEKLY", assignments: [],
    });
    check("Editar bono", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
  }
  if (bonusId) {
    const r = await call("DELETE", `/api/admin/bonuses/${bonusId}`);
    check("Borrar bono", r.status === 200, `status=${r.status}`);
  }

  // ═══════════════════════════ DESCUENTOS ═══════════════════════════
  section("DESCUENTOS");
  let discId;
  {
    const r = await call("POST", "/api/admin/discounts", {
      name: "Descuento E2E", valueType: "STANDARD", amount: 20000,
      assignmentType: "ALL", frequency: "BIWEEKLY", assignments: [],
    });
    check("Crear descuento", ok(r.status) && r.data?.id, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
    discId = r.data?.id;
  }
  {
    const r = await call("GET", "/api/admin/discounts");
    check("Listar descuentos", r.status === 200 && Array.isArray(r.data), `status=${r.status}`);
  }
  if (discId) {
    const r = await call("PUT", `/api/admin/discounts/${discId}`, {
      name: "Descuento E2E Editado", valueType: "STANDARD", amount: 25000,
      assignmentType: "ALL", frequency: "BIWEEKLY", assignments: [],
    });
    check("Editar descuento", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
  }
  if (discId) {
    const r = await call("DELETE", `/api/admin/discounts/${discId}`);
    check("Borrar descuento", r.status === 200, `status=${r.status}`);
  }

  // ═══════════════════════════ ROLES ═══════════════════════════
  section("ROLES");
  let roleId;
  {
    const r = await call("POST", "/api/admin/roles", {
      name: "Rol E2E", slug: "rol-e2e", description: "Rol de prueba",
      permissions: ["time_entries:view", "time_entries:create"],
    });
    check("Crear rol personalizado", ok(r.status) && r.data?.id, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
    roleId = r.data?.id;
  }
  {
    const r = await call("GET", "/api/admin/roles");
    check("Listar roles", r.status === 200 && Array.isArray(r.data), `status=${r.status}`);
  }
  if (roleId) {
    const r = await call("PUT", `/api/admin/roles/${roleId}`, {
      name: "Rol E2E Editado", permissions: ["time_entries:view"],
    });
    check("Editar rol", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
  }

  // ═══════════════════════════ USUARIOS ═══════════════════════════
  section("USUARIOS");
  let userId;
  {
    const r = await call("POST", "/api/admin/users", {
      username: "usuarioE2E", password: "claveE2E123", role: "ADMIN",
      customRoleId: roleId ?? null, employeeId: null,
    });
    check("Crear usuario del sistema", ok(r.status) && r.data?.id, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
    userId = r.data?.id;
  }
  {
    const r = await call("GET", "/api/admin/users");
    check("Listar usuarios", r.status === 200 && Array.isArray(r.data), `status=${r.status}`);
  }
  if (userId) {
    const r = await call("PUT", `/api/admin/users/${userId}`, { role: "SUPERADMIN" });
    check("Editar usuario (cambiar rol)", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
  }
  if (userId) {
    const r = await call("PUT", `/api/admin/users/${userId}/permissions`, {
      overrides: [{ permissionKey: "audit:view", granted: true }],
    });
    check("Asignar permisos individuales", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
  }
  // Los usuarios NO se borran (por diseño) — se desactivan para preservar auditoría/integridad.
  if (userId) {
    const r = await call("PUT", `/api/admin/users/${userId}`, { active: false });
    check("Desactivar usuario (no hay borrado físico por diseño)", r.status === 200, `status=${r.status}`);
  }
  // Confirmar que DELETE de usuario NO está permitido (405 por diseño)
  if (userId) {
    const r = await call("DELETE", `/api/admin/users/${userId}`);
    check("DELETE de usuario rechazado (405 por diseño)", r.status === 405, `status=${r.status} (esperado 405)`);
  }
  // Quitar el rol al usuario antes de borrarlo (libera la referencia)
  if (userId && roleId) {
    await call("PUT", `/api/admin/users/${userId}`, { customRoleId: null });
  }
  // Ahora sí borrar el rol (ya no está en uso)
  if (roleId) {
    const r = await call("DELETE", `/api/admin/roles/${roleId}`);
    check("Borrar rol", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
  }

  // ═══════════════════════════ CONFIGURACIÓN (TENANT) ═══════════════════════════
  section("CONFIGURACIÓN");
  {
    const r = await call("GET", "/api/admin/tenant");
    check("Leer configuración", ok(r.status) && r.data?.id, `status=${r.status}`);
  }
  {
    const r = await call("PUT", "/api/admin/tenant", { name: "Restaurante Demo E2E", primaryColor: "#AA5533" });
    check("Editar configuración (nombre/color)", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
    // restaurar
    await call("PUT", "/api/admin/tenant", { name: "Restaurante Demo", primaryColor: "#C1643F" });
  }
  // Validación: color inválido
  {
    const r = await call("PUT", "/api/admin/tenant", { primaryColor: "rojo" });
    check("Rechazar color inválido (validación)", r.status === 400, `status=${r.status} (esperado 400)`);
  }

  // ═══════════════════════════ REPORTES ═══════════════════════════
  section("REPORTES");
  {
    const r = await call("GET", `/api/admin/reports/payroll?from=${period.from}&to=${period.to}&type=payroll`);
    const total = r.data?.employees?.reduce((s, e) => s + (e.finalPay || 0), 0);
    check("Reporte de nómina con datos", r.status === 200 && r.data?.employees?.length >= 3 && total > 0, `status=${r.status} emp=${r.data?.employees?.length} total=${total}`);
  }
  {
    const r = await call("GET", `/api/admin/reports/payroll?from=${period.from}&to=${period.to}&type=shifts`);
    check("Reporte de turnos con datos", r.status === 200 && r.data?.employees?.length >= 1, `status=${r.status} emp=${r.data?.employees?.length}`);
  }

  // ═══════════════════════════ AUDITORÍA ═══════════════════════════
  section("AUDITORÍA");
  {
    const r = await call("GET", "/admin/audit");
    check("Página de auditoría carga", r.status === 200, `status=${r.status}`);
  }

  // ═══════════════════════════ LIMPIEZA ═══════════════════════════
  section("LIMPIEZA");
  if (empId) {
    const r = await call("DELETE", `/api/admin/employees/${empId}`);
    check("Borrar empleado de prueba (con credenciales)", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0,140)}`);
  }

  // ═══════════════════════════ RBAC (ADMIN) ═══════════════════════════
  section("RBAC — límites de ADMIN");
  {
    const adminLogin = await login("AdminValen", "Valen123");
    const acall = api(adminLogin.jar);
    // ADMIN no debe poder crear roles
    const r1 = await acall("POST", "/api/admin/roles", { name: "Hack", slug: "hack", permissions: [] });
    check("ADMIN bloqueado de crear roles", r1.status === 401 || r1.status === 403, `status=${r1.status} (esperado 401/403)`);
    // ADMIN no debe poder listar usuarios
    const r2 = await acall("GET", "/api/admin/users");
    check("ADMIN bloqueado de listar usuarios", r2.status === 401 || r2.status === 403, `status=${r2.status} (esperado 401/403)`);
    // ADMIN SÍ puede ver registro de horas
    const r3 = await acall("GET", "/api/admin/time-entries");
    check("ADMIN puede ver registro de horas", r3.status === 200, `status=${r3.status}`);
  }
  // EMPLOYEE no debe acceder a APIs de admin
  {
    const empLogin = await login("Vanessa", "Vanessa123");
    const ecall = api(empLogin.jar);
    const r1 = await ecall("GET", "/api/admin/employees");
    check("EMPLOYEE bloqueado de API admin", r1.status === 401 || r1.status === 403, `status=${r1.status} (esperado 401/403)`);
  }

  // ── Reporte final ──
  console.log(results.join("\n"));
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  RESULTADO: ${passed} ✅  |  ${failed} ❌  (${passed + failed} pruebas)`);
  console.log(`═══════════════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("ERROR FATAL:", e); process.exit(2); });
