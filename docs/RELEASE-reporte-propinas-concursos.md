# Release — Concursos en el reporte de propinas

Checklist de despliegue para la rama `feat/reporte-propinas-concursos`.
Reglas generales en [DESPLIEGUES.md](../DESPLIEGUES.md).

## Qué entra

| # | Cambio | Efecto visible |
|---|---|---|
| 1 | Apartado "Distribución de concursos" en el reporte de propinas | PDF: página tras la asignación. Excel: hoja "Concursos". Muestra lo reservado, los ítems, a quién se otorgó cada premio y en qué quincena se paga cada cuota |
| 2 | Solo aparece si un concurso `FINALIZADO` o `PAGADO` **terminó** dentro del rango | Un concurso se informa en el período en que terminó, aunque se pague en la quincena siguiente. Sin concursos cerrados el reporte queda como antes |
| 3 | "Reservado a concursos" en los totales y en el encabezado de cada día, cuando es mayor que 0 | El PDF y el Excel cuadran: bruto = menaje + concursos + distribuido. Hasta ahora solo lo mostraba la pantalla |

## Cambio de base de datos

**Ninguno.** Lee las tablas de concursos, que existen en producción desde el
release de concursos del 2026-10-05. No hay script que ejecutar.

### Permisos, env vars y feature flags

Ninguno nuevo. Usa los permisos de exportación de propinas que ya existen.

## Verificación hecha en local

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `npm run build` | compila sin errores |
| `npx vitest run` | **435/435** (13 pruebas nuevas del apartado) |
| `node scripts/verificar-concursos-e2e.mjs` | **72/72** |
| `node scripts/e2e-concursos.mjs` | **77/77** |
| Endpoints `/api/admin/tips/export/{pdf,excel}` con la base local | Julio: sin apartado. Agosto: concurso del 1 al 15 con su ganador. 16–31 de agosto: sin apartado, aunque una cuota se paga en esa quincena |
| Pantalla vs. PDF de agosto | Mismos totales: 2.525.144 = 252.514 + 50.503 + 2.222.127 |

## Pasos

1. Merge a `main` y push: el demo (`nomina-xpress`) se despliega solo.
2. Verificar el demo.
3. Promover Cucina dei Fiori: `git checkout client/cucina-fiori && git merge --ff-only main && git push`.
4. Verificar la URL de producción. Si algo falla, usar Instant Rollback en Vercel.
