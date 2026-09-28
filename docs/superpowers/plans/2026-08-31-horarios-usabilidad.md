# Horarios: usabilidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer el módulo de horarios intuitivo: formato de 12 horas en captura y lectura, día de descanso explícito, semana navegable en móvil y fecha de inicio elegible con sugerencia.

**Architecture:** Toda la lógica nueva sale a módulos puros y testeables (`schedule-week.ts`, `schedule-shifts.ts`, `formatTime12` en `shift-times.ts`) antes de tocar UI. La BD recibe un único campo aditivo `restDay`; las horas siguen NOT NULL con un centinela `"00:00"` encapsulado en `schedule-shifts.ts`. Las dos vistas duplicadas del empleado se unifican en un componente compartido.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Prisma 7 + libSQL/Turso, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-horarios-usabilidad-design.md`

## Global Constraints

- **No tocar:** `payroll.ts`, `payroll-report.ts`, PDF/Excel, `TimeEntry`, `src/lib/push.ts`, `publish/route.ts`, permisos, auditoría.
- **Migraciones:** nunca `prisma migrate`. Script idempotente propio en `prisma/` con rollback documentado, patrón de `prisma/turso-migrate-bonos-descuentos.mjs`. En local, `npx prisma db push`.
- **Contrato de horas:** todo lo que cruza API o BD es `"HH:mm"` de 24 horas. Las 12 horas son exclusivamente de presentación.
- **Invariante del descanso:** `restDay: true` ⇒ `startTime`/`endTime` = `"00:00"`, `startTime2`/`endTime2` = `null`. Solo `src/lib/schedule-shifts.ts` conoce el centinela.
- **Paleta existente:** `#2C1F15` texto, `#7A6358` secundario, `#E0D5CA` borde, `#F2EDE6` fondo cabecera, `#C1643F` acento, `#6B8E6B` verde (descanso), `#FAF7F2` claro.
- **Sin dependencias nuevas.**
- Idioma del UI: español de Colombia.

---

### Task 1: Módulo puro de semana (`schedule-week.ts`)

**Files:**
- Create: `src/lib/schedule-week.ts`
- Test: `src/lib/__tests__/schedule-week.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `addDays(dateStr: string, n: number): string`
  - `getWeekDates(weekStart: string): string[]` — 7 fechas `"YYYY-MM-DD"`
  - `dayLabelFor(dateStr: string): string` — `"Lun"`…`"Dom"`
  - `isSunday(dateStr: string): boolean`
  - `suggestWeekStart(lastCoveredDay: string | null, today: string): string`
  - `formatDayNumber(dateStr: string): string` — `"25/08"`
  - `type WeekRange = { id: string; name: string; start: string; end: string }`
  - `findOverlaps(weekStart: string, ranges: WeekRange[]): WeekRange[]`

- [ ] **Step 1: Escribir los tests**

Cubrir: `addDays` cruzando fin de mes y año; `getWeekDates` devuelve 7 días consecutivos; `dayLabelFor` los 7 días; `suggestWeekStart` con `null`, con último día futuro, con último día = hoy, con último día pasado, y el caso del domingo asignado (`lastCoveredDay` domingo ⇒ sugiere el lunes siguiente); `findOverlaps` con solapamiento parcial, total y sin solapamiento.

- [ ] **Step 2: Ejecutar y ver fallar** — `npx vitest run src/lib/__tests__/schedule-week.test.ts`
- [ ] **Step 3: Implementar** — aritmética de fechas con `new Date(y, m-1, d)` local, nunca `Date.parse` de ISO, para no depender de zona horaria.
- [ ] **Step 4: Ejecutar y ver pasar**
- [ ] **Step 5: Commit** — `feat(horarios): utilidades puras de semana`

---

### Task 2: `formatTime12`

**Files:**
- Modify: `src/lib/shift-times.ts`
- Test: `src/lib/__tests__/shift-times.test.ts`

**Interfaces:**
- Produces: `formatTime12(hhmm: string): string`

Reglas: `"00:00"` → `"12:00 a. m."`, `"12:00"` → `"12:00 m."`, `"15:00"` → `"3:00 p. m."`, `"23:59"` → `"11:59 p. m."`, `""` → `""`. Entrada con segundos (`"15:00:00"`) se tolera. Sin `Date`.

- [ ] **Step 1: Añadir los tests al archivo existente**
- [ ] **Step 2: Ejecutar y ver fallar**
- [ ] **Step 3: Implementar**
- [ ] **Step 4: Ejecutar y ver pasar** — la suite completa de `shift-times` sigue verde (regresión)
- [ ] **Step 5: Commit** — `feat(horarios): formatTime12`

---

### Task 3: Módulo del día de descanso (`schedule-shifts.ts`)

**Files:**
- Create: `src/lib/schedule-shifts.ts`
- Test: `src/lib/__tests__/schedule-shifts.test.ts`

**Interfaces:**
- Produces:
  - `REST_DAY_SENTINEL = "00:00"`
  - `type ShiftRow = { employeeId: string; date: string; startTime: string; endTime: string; startTime2: string | null; endTime2: string | null; restDay: boolean }`
  - `type ShiftDTO = { date: string; startTime: string | null; endTime: string | null; startTime2: string | null; endTime2: string | null; restDay: boolean }`
  - `buildRestDayShift(employeeId: string, date: string): ShiftRow`
  - `buildWorkShift(input): ShiftRow`
  - `toShiftDTO<T extends ShiftRow>(shift: T): T & ShiftDTO`

- [ ] **Step 1: Escribir los tests** — un descanso nunca expone horas por el DTO; un turno normal las conserva; `buildRestDayShift` pone el centinela y nulos en el 2.º turno.
- [ ] **Step 2: Ejecutar y ver fallar**
- [ ] **Step 3: Implementar**
- [ ] **Step 4: Ejecutar y ver pasar**
- [ ] **Step 5: Commit** — `feat(horarios): modulo de dia de descanso`

---

### Task 4: Esquema y migración

**Files:**
- Modify: `prisma/schema.prisma` (modelo `ScheduleShift`)
- Create: `prisma/turso-migrate-schedule-restday.mjs`

- [ ] **Step 1:** Añadir `restDay Boolean @default(false)` a `ScheduleShift`.
- [ ] **Step 2:** `npx prisma db push` + `npx prisma generate`.
- [ ] **Step 3:** Escribir el script de migración Turso (copiar la estructura de `exec()` de `turso-migrate-bonos-descuentos.mjs`), con `ALTER TABLE "ScheduleShift" ADD COLUMN "restDay" BOOLEAN NOT NULL DEFAULT false;` y el rollback documentado en la cabecera.
- [ ] **Step 4:** Verificar que la suite completa sigue verde — `npm run test`
- [ ] **Step 5: Commit** — `feat(horarios): campo restDay y migracion idempotente`

---

### Task 5: `TimePicker12` y `useHorizontalOverflow`

**Files:**
- Create: `src/components/ui/time-picker-12.tsx`
- Create: `src/lib/hooks/use-horizontal-overflow.ts`

**Interfaces:**
- Produces:
  - `<TimePicker12 value={string} onChange={(v: string) => void} ariaLabel={string} />` — value y onChange en `"HH:mm"` 24 h
  - `useHorizontalOverflow(ref): { canScrollLeft: boolean; canScrollRight: boolean }`

- [ ] **Step 1:** Implementar `TimePicker12`: tres `<select>` (hora 1–12, minuto en pasos de 5, AM/PM), estado derivado de `value`, `onChange` solo cuando los tres tienen valor; si el usuario vacía la hora, emite `""`.
- [ ] **Step 2:** Implementar el hook con listener de `scroll` + `ResizeObserver`, limpiando ambos en el cleanup.
- [ ] **Step 3:** `npm run lint`
- [ ] **Step 4: Commit** — `feat(horarios): selector de 12 horas y hook de desbordamiento`

---

### Task 6: API — aceptar y persistir `restDay`

**Files:**
- Modify: `src/app/api/admin/schedules/route.ts`
- Modify: `src/app/api/admin/schedules/[id]/route.ts`
- Modify: `src/app/api/employee/schedule/route.ts`

- [ ] **Step 1:** En ambas rutas de admin, `shiftSchema` gana `restDay: z.boolean().optional().default(false)`. Al persistir, si `restDay` es `true` se usa `buildRestDayShift` (ignorando cualquier hora del payload); si no, `buildWorkShift`.
- [ ] **Step 2:** En `employee/schedule`, mapear los turnos con `toShiftDTO` antes de responder.
- [ ] **Step 3:** `npm run lint` y `npx tsc --noEmit`
- [ ] **Step 4: Commit** — `feat(horarios): API acepta dia de descanso`

---

### Task 7: `ScheduleGrid` — 12 h, descanso, fecha de inicio y responsive

**Files:**
- Modify: `src/components/admin/schedules/ScheduleGrid.tsx`
- Modify: `src/app/admin/schedules/new/page.tsx`
- Modify: `src/app/admin/schedules/[id]/page.tsx`

- [ ] **Step 1:** `new/page.tsx` consulta el `Schedule` con `weekStart` mayor y los rangos existentes, calcula la sugerencia con `suggestWeekStart` y se los pasa al grid (`weekStart`, `existingRanges`, `editable: true`).
- [ ] **Step 2:** `ScheduleGrid` acepta `weekStart` como estado interno editable (solo cuando no hay `existingSchedule`), con `<input type="date">`. Al cambiar: recalcula columnas, conserva las celdas cuya fecha sigue en rango y pide confirmación antes de descartar las demás. Actualiza el nombre por defecto si el admin no lo editó.
- [ ] **Step 3:** Aviso no bloqueante de solapamiento con `findOverlaps`.
- [ ] **Step 4:** Sustituir los cuatro `<input type="time">` por `TimePicker12`.
- [ ] **Step 5:** Celda vacía con dos acciones (`+ Turno` / `Descansa`); celda de descanso con etiqueta verde y `X`. Estado `restDay` en `ShiftData`; `handleSave` incluye las filas de descanso.
- [ ] **Step 6:** Cabeceras con `dayLabelFor` e `isSunday`; columna Personal `sticky`; pista de scroll en móvil con el hook.
- [ ] **Step 7:** `npm run lint`
- [ ] **Step 8: Commit** — `feat(horarios): parrilla de admin con 12h, descanso y fecha de inicio`

---

### Task 8: Vistas de lectura

**Files:**
- Create: `src/components/shared/MyScheduleView.tsx`
- Modify: `src/app/portal/schedule/page.tsx`
- Modify: `src/app/admin/my-horario/page.tsx`
- Modify: `src/app/admin/schedules/[id]/view/page.tsx`

- [ ] **Step 1:** Extraer la vista duplicada a `MyScheduleView`, con 12 h, "Descansa", `dayLabelFor` y la pista de scroll.
- [ ] **Step 2:** Las dos páginas quedan como envoltorios delgados.
- [ ] **Step 3:** `[id]/view/page.tsx`: 12 h vía `formatTime12`, "Descansa", etiquetas por fecha real, columna Personal `sticky`, leyenda actualizada.
- [ ] **Step 4:** `npm run lint`
- [ ] **Step 5: Commit** — `feat(horarios): vistas de lectura en 12h con dia de descanso`

---

### Task 9: Datos de prueba locales y verificación final

**Files:**
- Create: `scripts/seed-horarios-demo.mjs`

- [ ] **Step 1:** Script que siembra en `dev.db` dos horarios: uno "viejo" (creado antes del cambio, sin descansos, para probar compatibilidad) y uno de la semana en curso con turnos, un 2.º turno, un día de descanso y un día vacío.
- [ ] **Step 2:** `npm run lint`
- [ ] **Step 3:** `npm run test`
- [ ] **Step 4:** `npm run build`
- [ ] **Step 5:** Levantar `npm run dev` y recorrer la lista de verificación manual de la §8 del spec, incluida la vista a 375 px.
- [ ] **Step 6: Commit** — `test(horarios): datos de prueba locales`

---

## Verificación final

Antes de dar el trabajo por terminado, los tres comandos en verde con salida real:

```bash
npm run lint && npm run test && npm run build
```
