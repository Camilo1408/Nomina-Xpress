/**
 * Siembra horarios de prueba en la base LOCAL para revisar a mano los cambios
 * de usabilidad (12 horas, día de descanso, responsive, fecha de inicio).
 *
 * Crea dos horarios:
 *
 *   1. "Semana anterior (antes del cambio)" — publicado, SIN ningún día de
 *      descanso, tal y como lo habría guardado la versión anterior del sistema.
 *      Sirve para comprobar la compatibilidad hacia atrás.
 *
 *   2. "Semana actual (prueba)" — publicado, con turnos normales, un turno
 *      partido, días de descanso y días sin asignar, para ver los tres estados
 *      de una celda uno al lado del otro.
 *
 * El segundo horario termina en domingo y cubre hasta hoy o más allá, así que
 * al entrar en "Nuevo horario" la fecha sugerida debe ser el LUNES SIGUIENTE
 * — el caso que motivó el cambio.
 *
 * Uso (PowerShell):
 *   $env:TURSO_DATABASE_URL="file:./dev.db"
 *   node scripts/seed-horarios-demo.mjs
 *
 * Para borrar lo sembrado:
 *   node scripts/seed-horarios-demo.mjs --limpiar
 */

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./dev.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const limpiar = process.argv.includes("--limpiar");

const db = createClient(authToken ? { url, authToken } : { url });

/** Marca en el nombre para poder identificar y borrar lo sembrado. */
const MARCA = "[prueba]";

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return toDateStr(date);
}

/** El lunes de la semana en la que cae `dateStr`. */
function getMonday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  return addDays(dateStr, day === 0 ? -6 : 1 - day);
}

function cuid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

async function borrarSembrado() {
  const existentes = await db.execute({
    sql: `SELECT id, name FROM "Schedule" WHERE name LIKE ?`,
    args: [`%${MARCA}%`],
  });
  for (const row of existentes.rows) {
    await db.execute({
      sql: `DELETE FROM "ScheduleShift" WHERE "scheduleId" = ?`,
      args: [row.id],
    });
    await db.execute({ sql: `DELETE FROM "Schedule" WHERE id = ?`, args: [row.id] });
    console.log(`  🗑️  Eliminado: ${row.name}`);
  }
  if (existentes.rows.length === 0) console.log("  (no había horarios de prueba)");
}

async function crearHorario({ tenantId, name, weekStart, filas }) {
  const scheduleId = cuid("sched");
  const ahora = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO "Schedule" (id, "tenantId", name, "weekStart", published, "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, 1, ?, ?)`,
    args: [scheduleId, tenantId, name, weekStart, ahora, ahora],
  });

  for (const f of filas) {
    await db.execute({
      sql: `INSERT INTO "ScheduleShift"
              (id, "scheduleId", "employeeId", date, "startTime", "endTime", "startTime2", "endTime2", "restDay")
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        cuid("shift"),
        scheduleId,
        f.employeeId,
        f.date,
        f.restDay ? "00:00" : f.startTime,
        f.restDay ? "00:00" : f.endTime,
        f.startTime2 ?? null,
        f.endTime2 ?? null,
        f.restDay ? 1 : 0,
      ],
    });
  }

  console.log(`  ✅  ${name} — ${filas.length} filas (semana del ${weekStart})`);
  return scheduleId;
}

async function main() {
  console.log(`\n🌱  Horarios de prueba — base: ${url}\n`);

  console.log("Limpiando horarios de prueba anteriores...");
  await borrarSembrado();

  if (limpiar) {
    console.log("\n✅  Listo (solo limpieza)\n");
    return;
  }

  const empleados = await db.execute(
    `SELECT id, name, "tenantId" FROM "Employee" WHERE active = 1 ORDER BY name LIMIT 5`
  );

  if (empleados.rows.length === 0) {
    console.error(
      "\n❌  No hay empleados activos en la base. Ejecuta primero:\n" +
        "    npx tsx prisma/seed-local.ts\n"
    );
    process.exit(1);
  }

  const tenantId = empleados.rows[0].tenantId;
  const emps = empleados.rows;
  console.log(`\nEmpleados: ${emps.map((e) => e.name).join(", ")}\n`);

  const hoy = toDateStr(new Date());
  const lunesActual = getMonday(hoy);
  const lunesAnterior = addDays(lunesActual, -7);

  // ── 1. Semana anterior, como la habría guardado la versión previa ────────
  console.log("Creando horario 'antes del cambio' (compatibilidad hacia atrás):");
  const filasViejas = [];
  for (const emp of emps.slice(0, 3)) {
    for (let i = 0; i < 5; i++) {
      filasViejas.push({
        employeeId: emp.id,
        date: addDays(lunesAnterior, i),
        startTime: "15:00",
        endTime: "23:00",
        restDay: false,
      });
    }
  }
  await crearHorario({
    tenantId,
    name: `${MARCA} Semana anterior (antes del cambio)`,
    weekStart: lunesAnterior,
    filas: filasViejas,
  });

  // ── 2. Semana en curso, con los tres estados de celda ────────────────────
  console.log("\nCreando horario de la semana en curso (tres estados de celda):");
  const filasNuevas = [];

  // Empleado 1: turnos de tarde de lunes a viernes, descansa sábado y domingo.
  const e1 = emps[0];
  for (let i = 0; i < 5; i++) {
    filasNuevas.push({
      employeeId: e1.id,
      date: addDays(lunesActual, i),
      startTime: "15:00",
      endTime: "23:00",
      restDay: false,
    });
  }
  filasNuevas.push({ employeeId: e1.id, date: addDays(lunesActual, 5), restDay: true });
  filasNuevas.push({ employeeId: e1.id, date: addDays(lunesActual, 6), restDay: true });

  // Empleado 2: turno partido el lunes, descansa el miércoles, jueves y viernes
  // sin asignar (no se crea fila), trabaja el domingo (tarifa especial).
  if (emps[1]) {
    const e2 = emps[1];
    filasNuevas.push({
      employeeId: e2.id,
      date: lunesActual,
      startTime: "08:00",
      endTime: "12:00",
      startTime2: "18:00",
      endTime2: "22:00",
      restDay: false,
    });
    filasNuevas.push({
      employeeId: e2.id,
      date: addDays(lunesActual, 1),
      startTime: "09:30",
      endTime: "17:00",
      restDay: false,
    });
    filasNuevas.push({ employeeId: e2.id, date: addDays(lunesActual, 2), restDay: true });
    // Jueves y viernes: sin fila, deliberadamente (celda vacía).
    filasNuevas.push({
      employeeId: e2.id,
      date: addDays(lunesActual, 5),
      startTime: "12:00",
      endTime: "20:00",
      restDay: false,
    });
    filasNuevas.push({
      employeeId: e2.id,
      date: addDays(lunesActual, 6),
      startTime: "11:00",
      endTime: "19:00",
      restDay: false,
    });
  }

  // Empleado 3: solo días de descanso — comprueba que igual recibe la
  // notificación de horario publicado, porque tiene filas en el horario.
  if (emps[2]) {
    const e3 = emps[2];
    for (let i = 0; i < 3; i++) {
      filasNuevas.push({
        employeeId: e3.id,
        date: addDays(lunesActual, i),
        restDay: true,
      });
    }
    filasNuevas.push({
      employeeId: e3.id,
      date: addDays(lunesActual, 3),
      startTime: "00:30",
      endTime: "02:00",
      restDay: false,
    });
    filasNuevas.push({
      employeeId: e3.id,
      date: addDays(lunesActual, 4),
      startTime: "12:00",
      endTime: "12:30",
      restDay: false,
    });
  }

  await crearHorario({
    tenantId,
    name: `${MARCA} Semana actual`,
    weekStart: lunesActual,
    filas: filasNuevas,
  });

  const ultimoDia = addDays(lunesActual, 6);
  console.log(`\n📅  Último día cubierto: ${ultimoDia} (domingo)`);
  console.log(
    `    En "Nuevo horario" la fecha sugerida debe ser: ${addDays(ultimoDia, 1)} (lunes siguiente)\n`
  );
  console.log("✅  Listo. Arranca el servidor con: npm run dev\n");
}

main()
  .catch((err) => {
    console.error(`\n❌  ${err.message}\n`);
    process.exit(1);
  })
  .finally(() => db.close());
