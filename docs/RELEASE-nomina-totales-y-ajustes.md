# Release — Nómina: totales del PDF/Excel y ajustes por período

Checklist de despliegue para la rama `fix/nomina-totales-y-ajustes`.
Reglas generales en [DESPLIEGUES.md](../DESPLIEGUES.md).

## Qué entra

| # | Cambio | Efecto visible |
|---|---|---|
| 1 | El PDF y el Excel dejan de sumar las propinas al "Total final a pagar" | El total exportado baja hasta igualar el de pantalla |
| 2a | Los ajustes se anclan en `periodStart` en vez de exigir contención total | Un ajuste con el período desalineado deja de desaparecer; un reporte de varios meses trae los de todos esos meses |
| 2b | Corrección de las fechas de un ajuste desde la UI | PROPRIETARY y SUPERADMIN pueden mover un ajuste a la quincena correcta |
| 2c | Bonos y descuentos recurrentes se aplican una vez por quincena del rango | Un reporte de dos meses aplica 4 quincenas, no 1 |
| 3 | Columna "Bruto" y fórmulas rotuladas en la tabla de reportes | Se lee `Bruto + Ajustes = Neto` y `Neto + Bonos − Desc. = Total final` |

## El bug de fondo (fix 1)

`src/app/api/admin/reports/payroll/route.ts` calculaba el total con `payroll.netPay`,
pero los dos exportadores lo hacían con `netPayWithTips`:

```ts
// antes, en export/pdf/route.ts y export/excel/route.ts
finalPay: clampFinalPay(netPayWithTips, empBonuses.totalBonuses, empDiscounts.totalDiscounts),
```

El Excel imprimía al pie "las propinas … no se suman al Total Final" mientras la
columna sí las sumaba. Afectaba a **todo el personal con propinas, en todas las
quincenas**. Ambos exportadores usan ahora `payroll.netPay`, igual que la pantalla
y que el portal del empleado.

## Semántica de los ajustes (fix 2a)

Antes: `periodStart >= from AND periodEnd <= to` (contención). Un ajuste guardado
con un rango que se salía de la quincena no entraba en **ningún** reporte.

Ahora: `periodStart >= from AND periodStart <= to` (anclaje en el inicio).

- Caso normal (período del ajuste = período del reporte): idéntico a antes.
- Ajuste desalineado: aparece en la quincena en la que empieza, no se pierde.
- Rango largo (dos meses, un trimestre): trae todos los ajustes cuyo inicio caiga
  dentro, **cada uno una sola vez** — `periodStart` es un punto, no puede caer en
  dos períodos consecutivos, así que no hay doble conteo.

La tabla marca con una etiqueta naranja el período de todo ajuste que no coincida
con el rango consultado, para que salte a la vista cuál hay que corregir.

## Cambio de base de datos

**Ninguno.** `PayAdjustment.periodStart` y `periodEnd` ya existen en producción;
solo cambian las consultas y quién puede escribirlas. No hay script de migración
que ejecutar.

### Permisos

Se añade la clave `pay_adjustments:edit_period` (catálogo en código, no en BD):

- `PROPRIETARY` la recibe automáticamente (tiene todos los permisos).
- `SUPERADMIN` la recibe por `BASE_ROLE_PERMISSIONS`.
- `ADMIN` **no** la tiene (tampoco tenía los demás `pay_adjustments:*`).
- Roles personalizados: hay que marcarla a mano en `/admin/roles` si se quiere dar.

Comprobado contra el backup de Cucina dei Fiori (14-07-2026): `sadminjavier` y
`Mantenimiento` son PROPRIETARY, `SadminMajo` es SUPERADMIN sin rol personalizado,
y el único rol personalizado ("PC Fiori") no tiene ningún permiso de ajustes.
**No hay nada que conceder a mano.**

### Env vars y feature flags

Ninguno nuevo. Nada que tocar en Vercel.

## Impacto medido sobre los datos reales

Simulación sobre una **copia** del backup `nominaxpress-fiori-back-14-07-2026`
(el original no se tocó), replicando la lógica vieja y la nueva:

| Quincena | Total en pantalla (antes) | Total PDF/Excel (antes) | Total nuevo (las 4 superficies) |
|---|---|---|---|
| 01–15 jun 2026 | $692 | $128.492 | $692 |
| 16–30 jun 2026 | $11.430.460 | $15.566.855 | $11.500.460 |
| 01–15 jul 2026 | $11.068.241 | $14.379.776 | $11.068.241 |

- **El total de pantalla no cambia para nadie**, salvo una fila: Valentina (Admin),
  16–30 jun, pasa de $612.520 a $682.520 porque se recupera un bono de $70.000
  ("bono administracion", período `2026-06-16 → 2026-07-01`) que hasta ahora no
  aparecía en ningún reporte.
- **El PDF y el Excel bajan** exactamente el monto de propinas de cada empleado.
  Ese era el error.

## Orden de release

No hay dependencia de esquema, así que es un despliegue de código normal.

1. **Mergear a `main`.** Vercel despliega el demo solo.

   ```bash
   git checkout main && git merge fix/nomina-totales-y-ajustes && git push
   ```

2. **Verificar el demo** (humano):
   - Reportes → Nómina, una quincena: comprobar que `Bruto + Ajustes = Neto` y
     que `Total final = Neto + Bonos − Descuentos`, con las propinas aparte.
   - Exportar el PDF y el Excel de esa misma quincena y comprobar que el
     "TOTAL FINAL A PAGAR" coincide con el de pantalla.
   - Rango de dos meses: los bonos recurrentes muestran "(×N quincenas)" y los
     ajustes de ambos meses aparecen una sola vez.
   - Entrar como PROPRIETARY, editar un ajuste y comprobar que aparece el bloque
     "Período al que se imputa".

3. **Promover el cliente** (Cucina dei Fiori):

   ```bash
   git checkout client/cucina-fiori
   git merge --ff-only main
   git push
   git checkout main
   ```

4. **Avisar al cliente** de que los PDF/Excel de quincenas anteriores mostraban un
   total inflado por el monto de las propinas. Si se archivaron esos documentos,
   conviene reemitirlos: los totales de **pantalla** de esas mismas quincenas eran
   los correctos y no cambian.

5. **Revisar el bono recuperado de Valentina** ($70.000, 16–30 jun 2026): verificar
   si se pagó por fuera del sistema. Si ya se pagó, corregir el período del ajuste
   o eliminarlo desde `/admin/reports/*` con el usuario PROPRIETARY.

6. **Rollback**: Vercel → proyecto → Deployments → Instant Rollback. No hay nada
   que revertir en la base de datos.

## Pruebas

`npm run test` — 24 archivos, 308 pruebas. Las nuevas:

| Archivo | Cubre |
|---|---|
| `src/app/api/admin/reports/payroll/__tests__/final-pay-consistency.test.ts` | Que pantalla, PDF, Excel y portal del empleado den el mismo total, con el caso real de una quincena de nómina; y el comportamiento en rangos de varias quincenas |
| `src/lib/excel/__tests__/payroll-template.test.ts` | Abre el .xlsx generado y verifica la columna "Total Final" y la nota al pie |
| `src/app/api/admin/pay-adjustments/__tests__/edit-period.test.ts` | Permiso `edit_period`, corrección de una o ambas fechas, rangos invertidos, 404, aislamiento por tenant y auditoría |
| `src/lib/__tests__/biweekly-periods-in-range.test.ts` | El descomponedor de rangos en quincenas |
| `src/lib/__tests__/bonus-discount-range.test.ts` | Bonos y descuentos en una quincena (sin cambios) y en rangos largos |
