# Reporte de Propinas (PDF y Excel) — Diseño

Fecha: 2026-09-25 · Rama: `feat/reporte-propinas` · Estado: aprobado por el propietario

## Objetivo

Permitir descargar desde la pantalla de Propinas (`/admin/tips`) un reporte en PDF y en Excel,
con el mismo estilo que los reportes de Turnos y Nómina, correspondiente al rango Desde/Hasta
seleccionado por el usuario, mostrando la propina de cada empleado en ese rango.

## Decisiones del propietario

- Contenido: **Asignación** (resumen por empleado) + **Detalle por día**.
- Detalle **agrupado por día** (igual que la vista "Por día" de la pantalla).
- **Firma del personal** por empleado en la asignación.
- Encabezado con totales del rango: **bruto, provisión menaje (10%) y distribuido**.
- **Permisos nuevos** `tips:export_pdf` y `tips:export_excel`.
- Por defecto los tienen PROPRIETARY (todos), SUPERADMIN y ADMIN (ADMIN ya exporta nómina).
  Los roles personalizados no los reciben automáticamente: se activan en Roles.

## Enfoque

Plantillas propias para propinas (no se extienden las de nómina): mismo estilo visual
(logo, color primario del tenant, encabezado, `formatCurrency`), lógica independiente.

## Componentes

### 1. `src/lib/tips-report.ts`

- `aggregateTipsReport(entries)` — función pura. Entrada: `TipEntry[]` con `distributions`
  (+ `employee.name`). Salida:
  - `totals`: `{ gross, menaje, distributed }` (suma de `totalAmount`, `menaje`, `netAmount`).
  - `byEmployee`: `{ employeeId, employeeName, totalHours, avgTipPercent, totalAmount }[]`
    — horas redondeadas a 2 decimales, % ponderado por horas redondeado a entero,
    total redondeado a entero; ordenado por total descendente. Es la misma lógica que hoy
    tiene `aggregateByEmployee` en `TipsClient.tsx`; se mueve aquí y `TipsClient` la importa.
  - `byDay`: `{ date, gross, menaje, distributed, notes, rows: { employeeName, hoursWorked,
    tipPercent, effectiveHours, ratePerHour, amount }[] }[]` ordenado por fecha ascendente;
    `ratePerHour = amount / effectiveHours` (0 si `effectiveHours` es 0), redondeado.
- `fetchTipsReport(tenantId, from, to)` — consulta Prisma con el mismo filtro de fechas que
  `GET /api/admin/tips` (por `date` entre `from` y `to`) e invoca `aggregateTipsReport`.
- Incluye empleados inactivos que recibieron propina en el rango.

### 2. `src/lib/excel/tips-template.ts`

`generateTipsExcel(report, period, tenantName, primaryColor, logo?) → Buffer` con 2 hojas:

- **"Asignación"**: logo, nombre del restaurante, "Reporte de Propinas", período; bloque de
  totales (Total propinas brutas / Provisión menaje (10%) / Total distribuido); tabla
  `Personal · Horas trabajadas · % Asignación · Total recibido · Firma del personal`
  y fila final "Total distribuido".
- **"Detalle por día"**: por cada día, fila de título con fecha, bruto, menaje y distribuido
  (y notas si hay); debajo `Personal · Horas · % Prop. · Hs. ef. · Prop./h · Propina`.
  Día sin reparto: fila "Sin horas registradas ese día — no se distribuyó".

### 3. `src/lib/pdf/tips-template.tsx`

Mismo contenido en A4 con `@react-pdf/renderer`: primero la asignación (con línea de firma por
empleado, igual que nómina), luego el detalle por día con salto de página automático
(`wrap`, sin partir el bloque de un día cuando sea posible).

### 4. Rutas

- `GET /api/admin/tips/export/excel?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/admin/tips/export/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD`

Cada una: `auth()` + `sessionCan(session, TIPS_EXPORT_EXCEL|PDF)` → 401; `from`/`to` faltantes
o con formato inválido o `from > to` → 400; carga tenant y logo (`loadTenantLogo`), genera el
archivo, registra `logAudit` como las exportaciones de nómina, y responde con
`Content-Disposition: attachment; filename="propinas_<from>_<to>.xlsx|pdf"`.

### 5. Permisos (`src/lib/permission-keys.ts`)

- `TIPS_EXPORT_PDF: "tips:export_pdf"`, `TIPS_EXPORT_EXCEL: "tips:export_excel"`.
- Agregados a `BASE_ROLE_PERMISSIONS.ADMIN` y `.SUPERADMIN`, al grupo del módulo `tips`
  y con etiquetas "Exportar PDF de propinas" / "Exportar Excel de propinas".
- Etiquetas de auditoría nuevas en `audit-labels.ts` si aplica.
- No requiere migración de base de datos (los permisos son claves en código; los roles
  personalizados guardan su lista y se editan desde Roles).

### 6. UI (`TipsClient.tsx` + `app/admin/tips/page.tsx`)

- La página pasa `canExportPdf` / `canExportExcel`.
- Botones "Exportar Excel" (verde `#6B8E6B`) y "Exportar PDF" (rojo `#B94040`) en la barra de
  filtros, visibles solo si hay registros y el usuario tiene el permiso.
- Usan el rango **aplicado** (el del último "Filtrar" / carga inicial), guardado en un estado
  `appliedRange`, no lo que esté escrito sin aplicar.
- Descarga vía `fetch` + blob (como `ReportsClient.downloadExport`); error → `toast.error`.

## Pruebas

- `src/lib/__tests__/tips-report.test.ts`: agregación por empleado (redondeo, % ponderado,
  orden), totales, `byDay` ordenado, `ratePerHour` con horas efectivas 0, y que
  `Σ byEmployee.totalAmount` coincide con `Σ distribuciones` redondeado.
- `src/lib/excel/__tests__/tips-template.test.ts`: nombres de hojas, fila de total y fila
  "Sin horas registradas" (patrón de `payroll-template.test.ts`).
- Verificación manual en el navegador: descargar ambos archivos para la quincena actual.

## Fuera de alcance

- Exportar desde el portal del empleado.
- Filtro por empleado individual dentro del reporte.
