# Release — Reporte de propinas (PDF/Excel) y bordes del PDF de nómina

Checklist de despliegue para las ramas `feat/reporte-propinas` y `fix/pdf-nomina-bordes`.
Reglas generales en [DESPLIEGUES.md](../DESPLIEGUES.md).

## Qué entra

| # | Cambio | Efecto visible |
|---|---|---|
| 1 | Exportar el reporte de propinas en PDF y Excel desde `/admin/tips` | Botones "Exportar Excel (propinas)" y "Exportar PDF (propinas)" que usan el rango aplicado con "Filtrar" |
| 2 | Contenido: "Asignación" (totales del rango, total por empleado y firma) + "Detalle por día" | Mismo estilo, logo y color que los reportes de nómina y turnos |
| 3 | Rango sin propinas → aviso de confirmación | Si el usuario acepta, se descarga un reporte en ceros |
| 4 | Líneas de firma y bordes visibles en el PDF de nómina y turnos | Antes no se dibujaban (bordes en shorthand que @react-pdf v4 ignora); el resumen del período ya no se parte entre páginas |

Especificación: `docs/superpowers/specs/2026-09-25-reporte-propinas-design.md`.

## Cambio de base de datos

**Ninguno.** El reporte lee `TipEntry` y `TipDistribution`, que ya existen en
producción. No hay script de migración que ejecutar.

### Permisos

Se añaden `tips:export_pdf` y `tips:export_excel` (catálogo en código, no en BD):

- `PROPRIETARY` los recibe automáticamente (tiene todos los permisos).
- `SUPERADMIN` y `ADMIN` los reciben por `BASE_ROLE_PERMISSIONS` (ADMIN ya exportaba nómina).
- Roles personalizados: hay que marcarlos a mano en `/admin/roles` si se quieren dar.

Revisado para Cucina dei Fiori: los roles base quedan cubiertos por
`BASE_ROLE_PERMISSIONS`. Los roles personalizados que ya existen no tienen
permisos de exportación, así que siguen sin poder exportar, igual que pasa con
la nómina. **No hay nada que conceder a mano.**

### Env vars y feature flags

Ninguno nuevo. Nada que tocar en Vercel.

## Verificación hecha

- `npx vitest run`: 332/332 pruebas pasan. `npm run build`: sin errores.
- En local, con los datos del demo del 01 al 15 de agosto de 2026, la pantalla, el Excel y el PDF muestran los mismos totales.
- El aviso de rango vacío funciona. Las rutas responden 400 con mensaje en español si las fechas no son válidas.
- Los PDF de propinas y de nómina se renderizaron y se revisaron visualmente: se ven las líneas de firma y los bordes.

## Nota conocida

"Total distribuido" puede diferir en $1 de "TOTAL ASIGNADO" porque cada empleado
se redondea por separado. La pantalla ya lo mostraba así antes de este cambio.
También puede ser mayor si un día tuvo propinas pero nadie registró horas.

## Pasos

1. Merge a `main` y push: el demo (`nomina-xpress`) se despliega solo.
2. Verificar el demo.
3. Promover Cucina dei Fiori: `git checkout client/cucina-fiori && git merge --ff-only main && git push`.
4. Verificar la URL de producción. Si algo falla, usar Instant Rollback en Vercel.
