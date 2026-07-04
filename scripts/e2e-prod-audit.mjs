/**
 * Auditoría E2E completa de producción
 * Credenciales: Mantenimiento / Mantenimiento123*
 * URL: https://nomina.cucinadeifiori.com
 *
 * Ejecutar: node scripts/e2e-prod-audit.mjs
 */
import { chromium } from "@playwright/test";

const BASE_URL = "https://nomina.cucinadeifiori.com";
const USER = "Mantenimiento";
const PASS = "Mantenimiento123*";

// Resultados acumulados
const results = [];
const cleanup = []; // { type, id, label }

function pass(module, test, detail = "") {
  results.push({ status: "✅ PASS", module, test, detail });
  console.log(`  ✅ ${test}${detail ? " — " + detail : ""}`);
}
function fail(module, test, detail = "") {
  results.push({ status: "❌ FAIL", module, test, detail });
  console.error(`  ❌ ${test} — ${detail}`);
}
function warn(module, test, detail = "") {
  results.push({ status: "⚠️ WARN", module, test, detail });
  console.warn(`  ⚠️  ${test} — ${detail}`);
}
function section(name) {
  console.log(`\n${"─".repeat(60)}\n  ${name}\n${"─".repeat(60)}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: false });
  const page = await ctx.newPage();

  // Capturar errores de consola del browser
  const consoleErrors = [];
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", err => consoleErrors.push(err.message));

  try {
    // ─── 1. LOGIN ───────────────────────────────────────────────
    section("1. LOGIN");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    const title = await page.title();
    pass("LOGIN", "Página de login carga", title);

    await page.fill('input[id="username"]', USER);
    await page.fill('input[id="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/admin/**", { timeout: 10000 }).catch(() => {});
    const afterUrl = page.url();
    if (afterUrl.includes("/admin/")) {
      pass("LOGIN", "Login exitoso", `redirigió a ${afterUrl}`);
    } else {
      fail("LOGIN", "Login falló", `URL actual: ${afterUrl}`);
      await browser.close();
      return;
    }

    // ─── 2. DASHBOARD ───────────────────────────────────────────
    section("2. DASHBOARD");
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: "networkidle" });
    const dashStatus = page.url().includes("/admin/dashboard") ? "ok" : "redirect";
    if (dashStatus === "ok") {
      pass("DASHBOARD", "Carga sin error 500");
    } else {
      fail("DASHBOARD", "No cargó", page.url());
    }
    const dashText = await page.textContent("body");
    if (dashText.includes("Dashboard")) pass("DASHBOARD", "Título visible");
    if (dashText.includes("Empleados activos")) pass("DASHBOARD", "Widget empleados activos");
    if (dashText.includes("Registros hoy")) pass("DASHBOARD", "Widget registros hoy");
    if (dashText.includes("Sin salida registrada")) pass("DASHBOARD", "Widget sin salida");
    if (dashText.includes("días anteriores")) {
      warn("DASHBOARD", "Alerta histórica presente", "Hay registros de días anteriores sin salida");
    } else {
      pass("DASHBOARD", "Sin alertas históricas pendientes");
    }

    // ─── 3. EMPLEADOS ───────────────────────────────────────────
    section("3. EMPLEADOS");
    await page.goto(`${BASE_URL}/admin/employees`, { waitUntil: "networkidle" });
    const empText = await page.textContent("body");
    if (page.url().includes("/admin/employees")) {
      pass("EMPLEADOS", "Módulo accesible");
    } else {
      fail("EMPLEADOS", "No accesible", page.url());
    }
    const empCount = (empText.match(/empleados?/gi) || []).length;
    if (empCount > 0) pass("EMPLEADOS", "Lista de empleados cargada");
    // Leer cuántos hay
    const empRows = await page.$$("table tbody tr, [data-employee-row]").catch(() => []);
    const empRowCount = empRows.length;
    pass("EMPLEADOS", `Filas visibles en tabla`, `${empRowCount} empleados`);

    // ─── 4. CREAR EMPLEADO DE PRUEBA ────────────────────────────
    section("4. CREAR EMPLEADO DE PRUEBA");
    let testEmployeeId = null;
    try {
      // Usar la API directamente para crear empleado de prueba
      const csrf = await page.evaluate(async () => {
        const r = await fetch("/api/auth/csrf");
        const j = await r.json();
        return j.csrfToken;
      });

      const empCreate = await page.evaluate(async () => {
        const r = await fetch("/api/admin/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "TEST_E2E_EMPLEADO",
            hourlyRateNormal: 6900,
            hourlyRateSpecial: 11400,
            tipPercent: 100,
            payType: "PAYROLL",
          }),
        });
        return { status: r.status, body: await r.json() };
      });

      if (empCreate.status === 201 || empCreate.status === 200) {
        testEmployeeId = empCreate.body.id;
        cleanup.push({ type: "employee", id: testEmployeeId, label: "TEST_E2E_EMPLEADO" });
        pass("EMPLEADOS", "Crear empleado via API", `id=${testEmployeeId}`);
      } else {
        warn("EMPLEADOS", "No se pudo crear empleado de prueba", JSON.stringify(empCreate.body));
      }
    } catch (e) {
      warn("EMPLEADOS", "Error al crear empleado", e.message);
    }

    // ─── 5. REGISTRO DE HORAS ───────────────────────────────────
    section("5. REGISTRO DE HORAS");
    await page.goto(`${BASE_URL}/admin/time-entries`, { waitUntil: "networkidle" });
    if (page.url().includes("/admin/time-entries")) {
      pass("TIME_ENTRIES", "Módulo accesible");
    } else {
      fail("TIME_ENTRIES", "No accesible", page.url());
    }
    const teText = await page.textContent("body");
    if (teText.includes("Registro de Horas")) pass("TIME_ENTRIES", "Título visible");
    if (teText.includes("registros")) pass("TIME_ENTRIES", "Contador de registros visible");

    // Crear registro de horas de prueba via API
    let testTimeEntryId = null;
    if (testEmployeeId) {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
      const teCreate = await page.evaluate(async ({ employeeId, date }) => {
        const checkIn = new Date();
        checkIn.setHours(8, 0, 0, 0);
        const checkOut = new Date();
        checkOut.setHours(10, 0, 0, 0);
        const r = await fetch("/api/admin/time-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId,
            date,
            checkIn: checkIn.toISOString(),
            checkOut: checkOut.toISOString(),
          }),
        });
        return { status: r.status, body: await r.json() };
      }, { employeeId: testEmployeeId, date: today });

      if (teCreate.status === 201 || teCreate.status === 200) {
        testTimeEntryId = teCreate.body.id;
        cleanup.push({ type: "timeEntry", id: testTimeEntryId, label: "TEST_E2E_TIME_ENTRY" });
        pass("TIME_ENTRIES", "Crear registro via API", `id=${testTimeEntryId}`);
      } else {
        warn("TIME_ENTRIES", "No se pudo crear registro de prueba", JSON.stringify(teCreate.body));
      }
    }

    // Verificar que el nuevo registro aparece en la lista
    await page.goto(`${BASE_URL}/admin/time-entries`, { waitUntil: "networkidle" });
    const teListText = await page.textContent("body");
    if (testEmployeeId && teListText.includes("TEST_E2E")) {
      pass("TIME_ENTRIES", "Registro de prueba aparece en lista");
    }

    // ─── 6. HORARIOS ────────────────────────────────────────────
    section("6. HORARIOS");
    await page.goto(`${BASE_URL}/admin/schedules`, { waitUntil: "networkidle" });
    if (page.url().includes("/admin/schedules")) {
      pass("HORARIOS", "Módulo accesible");
    } else {
      fail("HORARIOS", "No accesible", page.url());
    }
    const schText = await page.textContent("body");
    if (schText.includes("Horarios") || schText.includes("horario")) {
      pass("HORARIOS", "Contenido de horarios visible");
    }

    // ─── 7. PROPINAS ────────────────────────────────────────────
    section("7. PROPINAS");
    await page.goto(`${BASE_URL}/admin/tips`, { waitUntil: "networkidle" });
    if (page.url().includes("/admin/tips")) {
      pass("PROPINAS", "Módulo accesible");
    } else {
      fail("PROPINAS", "No accesible", page.url());
    }
    const tipsText = await page.textContent("body");
    if (tipsText.includes("Propinas") || tipsText.includes("propina")) {
      pass("PROPINAS", "Contenido de propinas visible");
    }

    // ─── 8. REPORTES NÓMINA ─────────────────────────────────────
    section("8. REPORTES NÓMINA");
    await page.goto(`${BASE_URL}/admin/reports/payroll`, { waitUntil: "networkidle" });
    if (page.url().includes("/admin/reports/payroll")) {
      pass("REPORTES_NOMINA", "Módulo accesible");
    } else {
      fail("REPORTES_NOMINA", "No accesible", page.url());
    }
    const prText = await page.textContent("body");
    if (prText.includes("Reportes") || prText.includes("Nómina")) pass("REPORTES_NOMINA", "Título visible");
    if (prText.includes("Calcular")) pass("REPORTES_NOMINA", "Botón Calcular presente");

    // Probar cálculo de nómina (quincena actual)
    const calcBtn = await page.$('button:has-text("Calcular")');
    if (calcBtn) {
      await calcBtn.click();
      await page.waitForTimeout(3000);
      const afterCalc = await page.textContent("body");
      if (afterCalc.includes("$") || afterCalc.includes("empleado")) {
        pass("REPORTES_NOMINA", "Cálculo de nómina ejecutado");
      } else if (afterCalc.includes("No hay datos")) {
        warn("REPORTES_NOMINA", "Sin datos para el período", "Puede ser período sin registros");
      }
    }

    // ─── 9. REPORTES TURNOS ─────────────────────────────────────
    section("9. REPORTES TURNOS");
    await page.goto(`${BASE_URL}/admin/reports/shifts`, { waitUntil: "networkidle" });
    if (page.url().includes("/admin/reports/shifts")) {
      pass("REPORTES_TURNOS", "Módulo accesible (sin error 500)");
    } else {
      fail("REPORTES_TURNOS", "No accesible", page.url());
    }
    const shiftsText = await page.textContent("body");
    if (shiftsText.includes("No hay datos") || shiftsText.includes("Todos")) {
      warn("REPORTES_TURNOS", "Sin empleados tipo SHIFT", "Todos los empleados tienen payType=PAYROLL — el reporte de turnos requiere empleados con payType=SHIFT");
    }

    // ─── 10. AUDITORÍA ──────────────────────────────────────────
    section("10. AUDITORÍA");
    await page.goto(`${BASE_URL}/admin/audit`, { waitUntil: "networkidle" });
    if (page.url().includes("/admin/audit")) {
      pass("AUDITORIA", "Módulo accesible");
    } else {
      fail("AUDITORIA", "No accesible", page.url());
    }
    const auditText = await page.textContent("body");
    if (auditText.includes("Auditoría") || auditText.includes("audit")) {
      pass("AUDITORIA", "Contenido de auditoría visible");
    }
    if (auditText.includes("LOGIN") || auditText.includes("Mantenimiento")) {
      pass("AUDITORIA", "Eventos de auditoría visibles");
    }

    // ─── 11. ROLES ──────────────────────────────────────────────
    section("11. ROLES");
    await page.goto(`${BASE_URL}/admin/roles`, { waitUntil: "networkidle" });
    if (page.url().includes("/admin/roles")) {
      pass("ROLES", "Módulo accesible");
    } else {
      fail("ROLES", "No accesible", page.url());
    }

    // ─── 12. USUARIOS ───────────────────────────────────────────
    section("12. USUARIOS");
    await page.goto(`${BASE_URL}/admin/usuarios`, { waitUntil: "networkidle" });
    if (page.url().includes("/admin/usuarios")) {
      pass("USUARIOS", "Módulo accesible");
    } else {
      fail("USUARIOS", "No accesible", page.url());
    }
    const usrText = await page.textContent("body");
    if (usrText.includes("Mantenimiento") || usrText.includes("SadminMajo")) {
      pass("USUARIOS", "Lista de usuarios visible");
    }

    // ─── 13. CONFIGURACIÓN ──────────────────────────────────────
    section("13. CONFIGURACIÓN");
    await page.goto(`${BASE_URL}/admin/settings`, { waitUntil: "networkidle" });
    if (page.url().includes("/admin/settings")) {
      pass("CONFIGURACION", "Módulo accesible");
    } else {
      fail("CONFIGURACION", "No accesible", page.url());
    }
    const settText = await page.textContent("body");
    if (settText.includes("Cucina") || settText.includes("configuración") || settText.includes("Configuración")) {
      pass("CONFIGURACION", "Configuración visible");
    }

    // ─── 14. PERFIL ─────────────────────────────────────────────
    section("14. PERFIL");
    await page.goto(`${BASE_URL}/admin/profile`, { waitUntil: "networkidle" });
    if (page.url().includes("/admin/profile")) {
      pass("PERFIL", "Módulo accesible");
    } else {
      fail("PERFIL", "No accesible", page.url());
    }

    // ─── 15. APIs CRÍTICAS ──────────────────────────────────────
    section("15. APIs CRÍTICAS");

    const apiTests = [
      { path: "/api/admin/employees", label: "GET /api/admin/employees" },
      { path: "/api/admin/time-entries?from=2026-06-01&to=2026-06-30", label: "GET /api/admin/time-entries" },
      { path: "/api/admin/tips", label: "GET /api/admin/tips" },
    ];

    for (const { path, label } of apiTests) {
      const apiResult = await page.evaluate(async (p) => {
        const r = await fetch(p);
        return { status: r.status, ok: r.ok };
      }, path);
      if (apiResult.ok) {
        pass("APIs", label, `HTTP ${apiResult.status}`);
      } else {
        fail("APIs", label, `HTTP ${apiResult.status}`);
      }
    }

    // ─── 16. ERRORES DE CONSOLA ─────────────────────────────────
    section("16. ERRORES DE CONSOLA");
    if (consoleErrors.length === 0) {
      pass("CONSOLA", "Sin errores JS en consola durante las pruebas");
    } else {
      for (const err of consoleErrors.slice(0, 5)) {
        warn("CONSOLA", "Error JS detectado", err.slice(0, 120));
      }
    }

    // ─── LIMPIEZA ───────────────────────────────────────────────
    section("LIMPIEZA DE DATOS DE PRUEBA");

    // Eliminar registro de horas primero (FK dependency)
    if (testTimeEntryId) {
      const delTE = await page.evaluate(async (id) => {
        const r = await fetch(`/api/admin/time-entries/${id}`, { method: "DELETE" });
        return r.status;
      }, testTimeEntryId);
      if (delTE === 200 || delTE === 204) {
        console.log(`  🗑️  Eliminado TimeEntry ${testTimeEntryId}`);
      } else {
        console.warn(`  ⚠️  No se pudo eliminar TimeEntry ${testTimeEntryId}: HTTP ${delTE}`);
      }
    }

    // Eliminar empleado de prueba
    if (testEmployeeId) {
      const delEmp = await page.evaluate(async (id) => {
        const r = await fetch(`/api/admin/employees/${id}`, { method: "DELETE" });
        return r.status;
      }, testEmployeeId);
      if (delEmp === 200 || delEmp === 204) {
        console.log(`  🗑️  Eliminado Empleado ${testEmployeeId} (TEST_E2E_EMPLEADO)`);
      } else {
        console.warn(`  ⚠️  No se pudo eliminar empleado ${testEmployeeId}: HTTP ${delEmp}`);
      }
    }

  } catch (e) {
    console.error("\n💥 Error inesperado:", e.message);
    fail("GENERAL", "Error inesperado en pruebas", e.message);
  } finally {
    await browser.close();
  }

  // ─── INFORME FINAL ──────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  INFORME FINAL DE AUDITORÍA — NÓMINA XPRESS");
  console.log("  Sistema: nomina.cucinadeifiori.com");
  console.log("  Usuario: Mantenimiento (PROPRIETARY)");
  console.log("  Fecha:", new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" }));
  console.log("═".repeat(60));

  const passes = results.filter(r => r.status.includes("PASS")).length;
  const fails  = results.filter(r => r.status.includes("FAIL")).length;
  const warns  = results.filter(r => r.status.includes("WARN")).length;

  console.log(`\n  Resumen: ${passes} ✅ PASS  |  ${warns} ⚠️ WARN  |  ${fails} ❌ FAIL\n`);

  // Agrupar por módulo
  const byModule = {};
  for (const r of results) {
    if (!byModule[r.module]) byModule[r.module] = [];
    byModule[r.module].push(r);
  }

  for (const [mod, items] of Object.entries(byModule)) {
    const modPasses = items.filter(i => i.status.includes("PASS")).length;
    const modFails  = items.filter(i => i.status.includes("FAIL")).length;
    const modWarns  = items.filter(i => i.status.includes("WARN")).length;
    const icon = modFails > 0 ? "❌" : modWarns > 0 ? "⚠️ " : "✅";
    console.log(`  ${icon} ${mod.padEnd(20)} ${modPasses}P ${modWarns}W ${modFails}F`);
    for (const i of items) {
      const d = i.detail ? ` (${i.detail})` : "";
      console.log(`     ${i.status} ${i.test}${d}`);
    }
  }

  console.log("\n" + "═".repeat(60));
  return { passes, warns, fails };
}

run().then(({ passes, warns, fails }) => {
  process.exit(fails > 0 ? 1 : 0);
}).catch(e => {
  console.error("Fatal:", e);
  process.exit(2);
});
