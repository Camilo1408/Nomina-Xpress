# Turnos que cruzan medianoche + tope diario de horas

**Fecha:** 2026-07-20
**Estado:** Aprobado, listo para implementar

## Problema

El registro de horas construye la fecha/hora de salida en el **mismo día**
calendario que la entrada (`buildDateTime` en `TimeEntryForm.tsx`). Un turno que
termina después de medianoche (p. ej. entrada `1:38 PM`, salida `12:20 AM`)
produce una salida `00:20` del mismo día — 13 h *antes* de la entrada — y tanto
el cliente como el servidor lo rechazan con
*"La hora de salida debe ser posterior a la hora de entrada."*

Los restaurantes a veces extienden un turno un poco pasada la medianoche, y esas
horas deben pagarse a la tarifa del **día en que inició** el turno.

## Objetivos

1. Permitir que la salida caiga en el **día siguiente**, con tope **máximo 2:00 AM**.
2. Las horas (incluidas las de la madrugada) se pagan a la tarifa del **día
   inicial** del turno.
3. Tope de **15 horas diarias por empleado**, sumando todos los turnos del día
   (incluye turnos partidos registrados como registros separados).

## Regla de cruce de medianoche

Un turno cruza medianoche cuando **la hora de salida ≤ la hora de entrada**. En
ese caso la salida se interpreta en el **día siguiente**, y solo se permite si
esa salida es **≤ 02:00** (inclusive). Si quedara entre 02:01 y la hora de
entrada, se **rechaza** con un mensaje que explica el límite de las 2:00 AM.

- El campo `date` del registro sigue siendo el **día de inicio** del turno.
- `isSpecial` se sigue calculando desde `date` (día de inicio) → todas las horas
  del registro, incluidas las de la madrugada, se pagan a la tarifa de ese día.
  **La lógica de nómina (`payroll.ts`) NO cambia.**

Zona horaria: Colombia es UTC-5 fijo (sin DST). El servidor valida la ventana
usando formateo en `America/Bogota` (igual que `formatTime`/`todayColombia`).

## Regla de tope diario

Constante `MAX_DAILY_HOURS = 15`. Al crear/editar un registro, el servidor suma
las horas de **todos los registros del empleado en ese `date`** (día de inicio) y
**rechaza si el total superaría 15 h** (se permite exactamente 15).

- Horas por registro = `calculateHours(checkIn, checkOut)` + (si existen)
  `calculateHours(checkIn2, checkOut2)`. Reutiliza `calculateHours` de `payroll.ts`.
- Turno partido: como cada turno se guarda como registro separado, cuando se
  postea el 2.º turno el 1.º ya existe como hermano → la suma se valida en el
  servidor. El cliente además pre-valida `turno1 + turno2` del formulario para
  avisar antes de guardar.
- Este tope hace innecesario un tope de duración por turno: el caso raro de un
  rollover absurdo (entrada 01:00 → salida 00:30 ≈ 23 h) queda rechazado por el
  tope diario.

## Enfoque

Helper compartido `src/lib/shift-times.ts` con la regla en un solo lugar, usado
por cliente y servidor (defensa en profundidad). Alternativas descartadas:
cambiar el contrato a `date + "HH:mm"` (refactor grande) o validar solo en
cliente (el servidor dejaría de imponer el tope de 2 AM).

## Cambios

1. **`src/lib/shift-times.ts` (nuevo)**
   - Constantes `MAX_OVERNIGHT_END_MINUTES = 120` (02:00) y `MAX_DAILY_HOURS = 15`.
   - Helper de **cliente**: dado `date` + `HH:mm` de entrada y salida, devuelve
     los ISO aplicando el rollover a día+1, o un error si la salida cae en la
     zona prohibida (02:01 … entrada). Incluye un predicado `crossesMidnight` para
     la pista visual "+1 día".
   - Helper de **servidor**: dado `date` + `checkIn`/`checkOut` (Date), valida que
     `salida > entrada` y que la salida caiga en `[date, date+1 02:00]` en
     `America/Bogota`.

2. **`src/components/admin/time-entries/TimeEntryForm.tsx`**
   - Construir las fechas con el helper (reemplaza `buildDateTime`).
   - Actualizar las 2 validaciones de cliente (turno 1 y turno 2 partido) para
     permitir el cruce de medianoche.
   - Pre-validar la suma `turno1 + turno2` contra `MAX_DAILY_HOURS` al enviar.
   - Pista visual **"+1 día"** junto a *Salida* cuando aplique el rollover.

3. **`src/app/api/admin/time-entries/route.ts` (POST)** y
   **`src/app/api/admin/time-entries/[id]/route.ts` (PUT)**
   - Reemplazar el check estricto `salida ≤ entrada` por la validación de ventana
     nocturna, para los pares `(checkIn, checkOut)` y `(checkIn2, checkOut2)`.
   - Añadir el tope diario: sumar las horas del día del empleado (registros
     hermanos + el nuevo/editado) y rechazar si supera 15 h. En el `PUT` se leen
     los hermanos del día siempre (hoy solo se leen al mover el registro).

4. **Sin cambios** en `src/lib/payroll.ts` ni en la lógica de solapamiento
   (`rangesOverlap`): con timestamps reales siguen siendo correctos.

## Mensajes de error

- Cruce inválido: *"La salida solo puede cruzar la medianoche hasta las 2:00 AM.
  Verifica la hora de salida."*
- Tope diario: *"El total de horas del día para este empleado superaría el máximo
  de 15 h (quedaría en X.X h)."*

## Pruebas

- Unit del helper `shift-times`: turno normal mismo día; cruce válido
  (13:38 → 00:20); tope exacto 02:00; rechazo a las 03:00; salida == entrada.
- Unit del tope diario: suma de turnos partidos que supera 15 h → rechazo;
  suma == 15 h → permitido.
- Nómina: horas de madrugada de un turno de **sábado** se pagan a tarifa
  **normal** (día inicial), no a la del domingo.

## Fuera de alcance (YAGNI)

- Tope de duración por turno individual (lo cubre el tope diario).
- Hacer `MAX_DAILY_HOURS` / el tope de 2 AM configurables por tenant.
- Cambiar el contrato de la API a `date + "HH:mm"`.
