# Horarios: usabilidad — formato 12 h, día de descanso, responsive y día de inicio

**Fecha:** 2026-08-31
**Rama:** `feat/horarios-usabilidad` (desde `main`)
**Estado:** aprobado por el propietario

## Problema

El módulo de horarios funciona, pero cuatro cosas lo hacen poco intuitivo:

1. Las horas se capturan y se muestran en formato de 24 horas. El restaurante
   razona en 12 horas ("3 p. m.", no "15:00"), tanto el admin que arma el
   horario como el empleado que lo consulta.
2. Una celda vacía es ambigua: no distingue "todavía no asigné este día" de
   "este día descansas". El empleado no tiene forma de saber cuál es cuál.
3. En móvil la tabla se desborda horizontalmente sin ninguna pista visual. El
   empleado ve el lunes y cree que esa es toda su semana.
4. El horario nuevo siempre arranca en el lunes de la semana en curso. Si el
   domingo que cierra la semana ya está asignado y trabajado, el admin termina
   generando un horario sobre una semana ya consumida.

## Objetivos

- Formato de 12 horas en captura (admin) y en lectura (admin y empleado).
- Un estado "Descansa" explícito, distinto de "sin asignar".
- La semana completa es evidentemente navegable en móvil.
- El admin elige la fecha de inicio del horario, con una sugerencia que evita
  repetir días ya cubiertos.

## No objetivos

Queda explícitamente fuera de alcance, y no debe tocarse:

- `src/lib/payroll.ts`, `src/lib/payroll-report.ts`, PDF y Excel.
- El modelo `TimeEntry` y el registro de horas reales trabajadas.
- El sistema de notificaciones push (`src/lib/push.ts`, `PushSubscription`,
  service worker). Ver "Notificaciones" abajo.
- Permisos (`PERMISSIONS.SCHEDULES_*`), roles y auditoría.
- La forma de la respuesta de `/api/employee/schedule` para los campos que hoy
  existen. Solo se añaden campos.
- Refactor no relacionado con estos cuatro cambios.

---

## 1. Modelo de datos

### Cambio

Un único campo nuevo en `ScheduleShift`:

```prisma
model ScheduleShift {
  // …campos existentes sin cambio…
  restDay    Boolean  @default(false)
}
```

`startTime` y `endTime` **siguen siendo `String` NOT NULL**.

### Por qué no se vuelven nullable

SQLite no soporta `ALTER TABLE … ALTER COLUMN`. Volverlas nullable obliga a
reconstruir la tabla (crear nueva, copiar filas, borrar, renombrar, recrear
índices) sobre la base de datos Turso de producción. Ese procedimiento no es
idempotente y su rollback es frágil, lo que contradice la regla del proyecto
(`CLAUDE.md`): los cambios de esquema se aplican con scripts idempotentes
propios, cada uno con su rollback.

Añadir una columna con `DEFAULT` sí es un `ALTER TABLE ADD COLUMN` puro:
aditivo, idempotente y reversible.

### Invariante del día de descanso

> Cuando `restDay` es `true`, `startTime` y `endTime` valen `"00:00"` y
> `startTime2` / `endTime2` valen `null`. Esos valores son un centinela sin
> significado horario y **nunca deben leerse ni mostrarse**.

La invariante vive en un solo lugar del código, `src/lib/schedule-shifts.ts`,
que expone:

- `REST_DAY_SENTINEL` — la constante `"00:00"`.
- `buildRestDayShift(employeeId, date)` — construye la fila de descanso.
- `toShiftDTO(shift)` — normaliza una fila de la BD para el cliente: si
  `restDay` es `true`, devuelve `startTime: null`, `endTime: null`.

Ninguna vista lee `startTime` directamente de Prisma; todas consumen el DTO.
Así el centinela no se filtra fuera de ese módulo.

### Tres estados de una celda (empleado × día)

| Estado | En la BD | Empleado ve | Notifica |
|---|---|---|---|
| Sin asignar | no existe la fila | `—` | no |
| Turno | fila con horas, `restDay: false` | las horas en 12 h | sí (push existente) |
| Descansa | fila con `restDay: true` | **Descansa** | sí (push existente) |

### Migración

`prisma/turso-migrate-schedule-restday.mjs`, siguiendo el patrón de
`turso-migrate-bonos-descuentos.mjs`:

```sql
ALTER TABLE "ScheduleShift" ADD COLUMN "restDay" BOOLEAN NOT NULL DEFAULT false;
```

Idempotente: si la columna existe, el error `duplicate column` se detecta y se
omite. Rollback documentado en el mismo archivo (`ALTER TABLE … DROP COLUMN`,
soportado por la versión de SQLite de Turso; si fallara, la columna puede
quedarse: con `restDay = false` en todas las filas el sistema anterior funciona
igual).

En local se aplica con `npx prisma db push`.

### Compatibilidad hacia atrás

Los turnos existentes quedan con `restDay = false` y sus horas intactas. Un
despliegue del código nuevo contra una BD sin la columna fallaría, así que el
orden de release es: **migración primero, código después** (ver sección 7).

---

## 2. Formato de 12 horas

### Lectura — `formatTime12`

En `src/lib/shift-times.ts` se añade una función pura:

```ts
export function formatTime12(hhmm: string): string
```

`"15:00"` → `"3:00 p. m."`, `"00:30"` → `"12:30 a. m."`, `"12:00"` → `"12:00 m."`
(mediodía). Trabaja sobre el string, sin construir `Date`, para no depender de
zona horaria. Cubierta por tests en `src/lib/__tests__/shift-times.test.ts`.

No se reutiliza `formatTime` de `src/lib/utils.ts` porque esa recibe un `Date`
y convierte a `America/Bogota`; aquí la entrada es un `"HH:mm"` sin fecha.

### Captura — `TimeInput12`

Componente nuevo `src/components/ui/time-input-12.tsx`.

- Interfaz: `value: string` (`"HH:mm"` de 24 h, o `""`), `onChange(value: string)`.
- Un campo de **texto que se escribe** más dos botones a. m. / p. m.
- **Emite y recibe siempre 24 h.** El contrato con la API, con
  `shift-times.ts` y con el cálculo de nómina no cambia.

Se probó primero con tres desplegables (hora / minutos / AM-PM). Garantizaba
el formato, pero obligaba a tres clics por hora y armar una semana entera se
volvía lento. El propietario pidió volver a poder escribir la hora, como con
el `<input type="time">` anterior, sin perder las 12 horas.

La interpretación de lo escrito vive en `src/lib/time-input-12.ts`, que es
puro y está cubierto por tests. Acepta lo que la gente escribe de verdad:

| Escribe | Resultado |
|---|---|
| `3` | 3:00, conserva el a. m./p. m. que ya tuviera |
| `300` | 3:00 |
| `3:5` | 3:05 |
| `3:30`, `3.30` | 3:30 |
| `3pm`, `3 p.m.`, `3p` | 3:00 p. m. |
| `15:30`, `1530` | 3:30 p. m. (las 24 h se convierten solas) |
| `0830` | 8:30 a. m. (cuatro dígitos con cero delante = 24 h) |
| `12am` / `12pm` | 12:00 a. m. / 12:00 m. |

Los dígitos de 13 a 23 mandan sobre un sufijo contradictorio: `15:00 am` no
existe, así que se guarda como 3:00 p. m. Un texto que no es una hora marca el
campo en rojo y no emite valor, sin borrar lo que la persona escribió.

Sustituye los cuatro `<input type="time">` de `ScheduleGrid.tsx`.

### Alcance de la sustitución

Solo el módulo de horarios. El registro de horas reales (`/admin/hours`) y
cualquier otro `input type="time"` del sistema quedan como están: cambiarlos
está fuera del alcance acordado.

---

## 3. Día de descanso en la interfaz

### Admin (`ScheduleGrid`)

Una celda vacía muestra hoy un único botón `+`. Pasa a mostrar dos acciones:

- **`+` Asignar turno** — comportamiento actual.
- **"Descansa"** — marca el día como descanso.

Una celda marcada como descanso muestra la etiqueta `Descansa` con estilo
propio (verde apagado `#6B8E6B`, coherente con el badge "Publicado" existente)
y una `X` para volverla a vaciar. No muestra campos de hora ni la acción de
2.º turno.

Estado del componente: el `Record<string, ShiftData>` gana un campo
`restDay: boolean`. `handleSave` emite las filas de descanso con el centinela
vía `buildRestDayShift`.

### Empleado (`MyScheduleView`)

La celda del día muestra `Descansa` en lugar de las horas. Un día sin fila
sigue mostrando `—`.

### Validación en la API

`shiftSchema` en `src/app/api/admin/schedules/route.ts` y en
`[id]/route.ts` gana `restDay: z.boolean().optional().default(false)`, con un
refinamiento: si `restDay` es `true`, `startTime2`/`endTime2` deben venir
nulos. Una fila con `restDay: true` se persiste siempre a través de
`buildRestDayShift`, ignorando cualquier hora que llegue en el payload — el
servidor no confía en que el cliente respete el centinela.

### Un solo horario publicado a la vez

`POST /api/admin/schedules/[id]/publish` despublica los demás horarios del
tenant al publicar uno. Antes podían quedar varios publicados a la vez: el
portal del empleado muestra el publicado más reciente, así que con dos vigentes
el personal podía estar mirando una semana vieja, o mezclar turnos de dos
horarios distintos.

La despublicación y la publicación van en una única `prisma.$transaction`, de
modo que no existe ni un instante con dos horarios publicados. La respuesta
devuelve `unpublished: string[]` y el aviso del admin lo dice explícitamente;
la auditoría registra qué horarios se desplazaron.

Despublicar a mano sigue funcionando igual y no toca a los demás.

### Notificaciones — sin cambios

`POST /api/admin/schedules/[id]/publish` notifica hoy a
`[...new Set(schedule.shifts.map(s => s.employeeId))]`. Como un día de descanso
**es** una fila de `ScheduleShift`, un empleado que solo tenga descansos entra
en ese conjunto automáticamente y recibe el push "Horario actualizado" que ya
existe.

**No se modifica `publish/route.ts` ni `src/lib/push.ts`.** No se añade ningún
push nuevo. Esto satisface el requisito ("que se le notifique que descansa ese
día") sin tocar un sistema que hoy funciona.

---

## 4. Elección de la fecha de inicio

### Sugerencia

`/admin/schedules/new` calcula en el servidor la fecha propuesta:

1. Se busca el `Schedule` del tenant con `weekStart` más alto.
2. Su último día cubierto es `weekStart + 6`.
3. Si ese último día es **hoy o posterior**, se sugiere `último día + 1`.
   Caso del domingo ya asignado: el horario nuevo arranca el lunes siguiente.
4. Si no hay horarios, o el último día ya pasó, se sugiere el lunes de la
   semana en curso (comportamiento actual, `getMonday`).

La lógica vive en `src/lib/schedule-week.ts` como función pura
`suggestWeekStart(lastCoveredDay: string | null, today: string): string`,
con tests. La página solo consulta la BD y la invoca.

### Selección

Encima de la parrilla, un `<input type="date">` con la fecha sugerida. Al
cambiarla, la parrilla se recalcula (7 días desde la nueva fecha) **sin perder
los turnos ya capturados para fechas que sigan dentro del rango**; los que
queden fuera se descartan tras una confirmación explícita.

El nombre por defecto del horario (`Horario semana <fecha>`) se actualiza con
la fecha elegida mientras el admin no lo haya editado a mano.

### Aviso de solapamiento

La página entrega al cliente los rangos `[weekStart, weekStart+6]` de los
horarios existentes. Si el rango elegido se solapa con alguno, se muestra un
aviso **no bloqueante**: `Se solapa con «<nombre>»`. Puede haber razones
legítimas para hacerlo; la decisión es del admin.

### Etiquetas de día

Hoy `DAY_NAMES = ["Lun", …, "Dom"]` está fijo por índice, lo que sería
incorrecto si la semana no empieza en lunes. Pasa a derivarse de la fecha real
de cada columna. Función pura `dayLabelFor(dateStr)` en `schedule-week.ts`.
Afecta a `ScheduleGrid`, a `[id]/view/page.tsx` y a `MyScheduleView`.

El resaltado de domingo (tarifa especial) también pasa a calcularse por fecha,
no por índice de columna.

---

## 5. Responsive

En las tres tablas (`ScheduleGrid`, `[id]/view`, `MyScheduleView`):

- Columna "Personal" fija con `sticky left-0` y fondo opaco.
  (En `MyScheduleView` no hay columna de personal; solo aplica lo demás.)
- Sombra en el borde derecho del contenedor, visible **solo mientras queda
  contenido por revelar**. Se implementa con un hook
  `useHorizontalOverflow(ref)` en `src/lib/hooks/use-horizontal-overflow.ts`
  que expone `{ canScrollLeft, canScrollRight }` a partir de `scrollLeft`,
  `scrollWidth` y `clientWidth`, con listener de `scroll` y `ResizeObserver`.
- Debajo del encabezado, la pista `← Desliza para ver los demás días →`,
  visible solo en móvil (`sm:hidden`) y solo si hay desbordamiento real.
  Las flechas se atenúan según se llegue a cada extremo.

Sin librerías nuevas.

---

## 6. Refactor incluido

`src/app/admin/my-horario/page.tsx` y `src/app/portal/schedule/page.tsx` son
hoy el mismo archivo duplicado (misma tabla, mismo fetch, mismo markup). Los
tres cambios de este trabajo (12 h, descanso, responsive) tocan ambos.

Se extrae `src/components/shared/MyScheduleView.tsx` con toda la vista, y las
dos páginas quedan como envoltorios delgados. Sin esto, cada cambio se
escribiría dos veces con riesgo de desincronización.

Es el único refactor del alcance.

---

## 7. Despliegue

Según `DESPLIEGUES.md`: un solo código base en `main`, clientes como punteros
de release, cambios de esquema con script idempotente propio.

**Orden obligatorio** (la columna debe existir antes de que corra el código
nuevo):

1. Ejecutar `prisma/turso-migrate-schedule-restday.mjs` contra la BD Turso del
   **demo** (`nomina-xpress`).
2. Mergear `feat/horarios-usabilidad` → `main`. Vercel despliega el demo solo.
3. Verificar y aprobar el demo manualmente.
4. Ejecutar el mismo script contra la BD Turso de **cada cliente** que se vaya
   a promover (`cucina-fiori`, …).
5. Promover el cliente: `git checkout client/cucina-fiori && git merge --ff-only main && git push`.
6. Verificar la URL de producción del cliente.

**Rollback:** Instant Rollback en Vercel al deployment anterior. La columna
`restDay` puede quedarse en la BD sin efecto (todas las filas en `false`), así
que no hay que revertir el esquema para volver atrás.

**Env vars:** ninguna nueva. **Feature flags:** ninguno nuevo.

---

## 8. Pruebas

### Unitarias (Vitest)

- `formatTime12`: mediodía, medianoche, 1 p. m., 11:59 p. m., minutos con cero
  a la izquierda, string vacío.
- `parseTypedTime`: cada fila de la tabla de formatos aceptados, el sufijo
  contradictorio, el texto que no es una hora, y la ida y vuelta
  `fromValue24` → `parseTypedTime`.
- `suggestWeekStart`: sin horarios previos; último día en el futuro; último día
  hoy; último día ya pasado; el caso del domingo asignado.
- `dayLabelFor`: los siete días, y una semana que empieza en domingo.
- `toShiftDTO` / `buildRestDayShift`: un día de descanso nunca expone horas.
- Regresión: las funciones existentes de `shift-times.ts` siguen pasando.

### Manuales, en local (`npm run dev`)

El propietario revisa antes de cualquier despliegue:

1. Crear un horario: la fecha sugerida es correcta, se puede cambiar, el aviso
   de solapamiento aparece.
2. Capturar turnos con el selector de 12 h, incluido un 2.º turno.
3. Marcar un día como "Descansa" y otro dejarlo vacío. Guardar.
4. Ver el detalle en `/admin/schedules/<id>/view`: horas en 12 h, "Descansa"
   visible, vacío como `—`.
5. Publicar y entrar como empleado (`empleado`/`empleado123`): el horario se ve
   en 12 h, con "Descansa" donde corresponde, y llega la notificación push
   existente.
6. En móvil (o DevTools a 375 px): la pista de scroll aparece, la columna de
   personal queda fija y se llega hasta el domingo.
7. Verificar que un horario **creado antes** de este cambio se sigue viendo
   bien (compatibilidad hacia atrás).

### Verificación final

`npm run lint`, `npm run test` y `npm run build` en verde antes de dar el
trabajo por terminado.
