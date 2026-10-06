# Release — Concursos e incentivos

Checklist de despliegue para la rama `feat/concursos`.
Reglas generales en [DESPLIEGUES.md](../DESPLIEGUES.md).

> **Estado: rama subida, pendiente de release.** `feat/concursos` está en
> `origin`, al día con `main` y verificada en local. El merge a `main`, las
> migraciones y la promoción a producción quedan a cargo de **@JulianDM22**
> (ver [Traspaso](#traspaso)).

## Qué entra

| # | Cambio | Efecto visible |
|---|---|---|
| 1 | Módulo de concursos en `/admin/contests` | Entrada "Concursos" en el menú lateral. Crear concursos con varios ítems, cada uno con su meta y su porcentaje |
| 2 | Las propinas del rango reservan un % adicional por ítem | En `/admin/tips`: tarjeta "Reservado a concursos" y desglose por ítem al abrir un día |
| 3 | Registro manual de resultados y adjudicación del ganador | El sistema resuelve el ganador según el criterio del ítem entre quienes alcanzan la meta |
| 4 | Bono pagado en una o dos quincenas | Panel de bonos con cuotas, saldo pendiente y marcado de pago idempotente |
| 5 | El bono aparece en nómina, turnos y portal del empleado | **Informativo, igual que las propinas: no entra en el total a pagar** |

Especificación: `docs/superpowers/specs/2026-08-12-concursos-incentivos-design.md`.

### La invariante que sostiene el módulo

Por día, y debe cuadrar al peso:

```
TipEntry.totalAmount = menaje + contestReserved + netAmount
```

El neto se obtiene **por resta**, nunca por porcentaje, para que la suma de las
partes sea exacta pase lo que pase con el redondeo. Hay pruebas que fallan si
alguna de las cuatro superficies (pantalla, PDF, Excel, portal) se desvía.

## Cambio de base de datos

**Sí lo hay.** Script idempotente: `prisma/turso-migrate-concursos.mjs`.

**Crea 6 tablas:** `Contest`, `ContestItem`, `ContestItemResult`,
`ContestTipReserve`, `ContestBonus`, `ContestBonusPayment`, con sus 21 índices.

**Añade 1 columna:** `TipEntry.contestReserved REAL NOT NULL DEFAULT 0`.

**No modifica ninguna tabla existente más allá de esa columna y no reescribe
ningún dato.** Toda fila de `TipEntry` anterior a la migración queda con
`contestReserved = 0`, así que su `netAmount` sigue siendo exactamente
`totalAmount − menaje` y la invariante se cumple sin tocar nada.

```bash
TURSO_DATABASE_URL="libsql://<cliente>.turso.io" TURSO_AUTH_TOKEN="<token>" \
  node prisma/turso-migrate-concursos.mjs
```

El script comprueba que existe `TipEntry` antes de empezar (para no correrlo
contra una base equivocada), es seguro de repetir, y al terminar verifica las
6 tablas, la columna y que ningún registro quedó con reserva.

### Rollback de la migración

`prisma/turso-rollback-concursos.mjs --confirmar` elimina las 6 tablas.

La columna `TipEntry.contestReserved` **se deja a propósito**: SQLite no soporta
`DROP COLUMN` sin recrear la tabla, y recrear `TipEntry` en producción es mucho
más arriesgado que dejar una columna en 0 que nadie lee.

> ⚠️ El rollback **no** devuelve el dinero reservado. Si hubiera concursos
> activos con reservas, hay que **cancelarlos desde la aplicación primero** (eso
> recalcula las propinas y devuelve el dinero al reparto) y solo después correr
> el rollback. La cabecera del script lo repite.

### Permisos

Se añaden seis claves al catálogo en código (no en BD):

`contests:view` · `contests:create` · `contests:edit` · `contests:delete` ·
`contests:award` · `contests:pay`

- `PROPRIETARY` las recibe automáticamente (tiene todos los permisos).
- `SUPERADMIN` recibe las seis por `BASE_ROLE_PERMISSIONS`.
- `ADMIN` recibe solo `contests:view` (lectura).
- `EMPLOYEE` ninguna; ve sus propios bonos por el portal.
- Roles personalizados: hay que marcarlas a mano en `/admin/roles` si se quieren dar.

### Env vars y feature flags

Ninguno nuevo. Nada que tocar en Vercel.

## Verificación hecha en local

Sobre la rama ya puesta al día con `main` (merge `7b0aa4f`):

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `npm run build` | compila sin errores |
| `npx vitest run` | **423/423** |
| `node scripts/verificar-concursos-e2e.mjs` | **72/72**, dos pasadas |
| `node scripts/e2e-concursos.mjs` | **77/77** |
| `npx eslint src` | 7 errores — los mismos que ya tiene `main`, ninguno nuevo |
| `node prisma/turso-migrate-concursos.mjs` | aplicado sobre `dev.db`, idempotente |

Los cuatro puntos que pidió el propietario, comprobados con datos reales:

1. **Redistribución retroactiva** — 1.350.000 repartidos pasan a 1.305.000 al
   activar un concurso del 3%: bajan exactamente los 45.000 reservados.
2. **Propinas posteriores** — un día nuevo de 300.000 reserva 9.000 al
   registrarse, sin necesidad de recálculo.
3. **En el reporte** — el bono sale en nómina o turnos según el tipo del
   empleado, como concepto aparte, y `finalPay` no lo incluye.
4. **En el PDF** — se extrajo el texto del PDF generado y se comprobó el importe
   **pegado a la etiqueta** "TOTAL FINAL A PAGAR": es el neto, con propinas y
   bono en líneas informativas debajo.

### Lo que NO se pudo verificar

`scripts/e2e-full-test.mjs` **no se ejecutó**: tiene credenciales de un cliente
real (`SadminJavier`, `AdminValen`, `Vanessa`) que no existen en el seed local.
Es una limitación preexistente —ni esta rama ni `main` tocaron ese script— pero
queda pendiente para quien tenga un entorno con esos usuarios.

## Riesgos conocidos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Cancelar un concurso recalcula propinas ya repartidas.** Decisión explícita del propietario: se permite en cualquier momento, incluso si la quincena ya se pagó. | Diálogo que lista día por día el impacto antes de confirmar; las reservas quedan `DEVUELTA`, no se borran; auditoría completa. La trazabilidad se conserva, pero el histórico vivo sí se mueve. |
| 2 | Activar un concurso reduce propinas ya mostradas al empleado. | Mismo diálogo de impacto. Recomendación operativa: activarlo antes de que empiece su rango. |
| 3 | Un concurso activo y olvidado sigue descontando. | Aviso en la pantalla de concursos. |
| 4 | El servidor de desarrollo de Next deja de registrar las rutas anidadas bajo dos segmentos dinámicos (`.../[id]/items/[itemId]/results`) si se crean con el servidor ya arrancado. | Solo afecta a desarrollo: `rm -rf .next && npm run dev`. La build de producción las registra correctamente. La verificación E2E ahora lo detecta. |

## Pasos

Orden obligatorio. La migración va **antes** del código que la necesita.

1. **Push de la rama** y revisión (PR o revisión directa, según se acuerde).
2. **Backup de la BD del demo** — ver [BACKUP.md](../BACKUP.md).
3. **Migrar el demo**: `node prisma/turso-migrate-concursos.mjs` con las
   credenciales del demo.
4. **Merge a `main` y push** → el demo (`nomina-xpress`) se despliega solo.
5. **Verificar el demo**: entrar a `/admin/contests`, crear un concurso de
   prueba, activarlo, comprobar que las propinas del rango reservan, y que el
   PDF de nómina sigue mostrando el total sin propinas.
6. **Aprobación manual** del propietario.
7. **Backup de la BD de Cucina dei Fiori.**
8. **Migrar Cucina dei Fiori** con sus credenciales.
9. **Promover el cliente**:
   ```bash
   git checkout client/cucina-fiori
   git merge --ff-only main
   git push
   git checkout main
   ```
10. **Verificar producción**: nómina, propinas, concursos, bonos y reportes.
    Revisar que no haya errores en los logs de Vercel.

Si algo falla: **Instant Rollback** en Vercel para el código. Para la base,
`turso-rollback-concursos.mjs` (leyendo antes la advertencia de arriba) o
restaurar el backup.

## Traspaso

La rama ya está en `origin`. A partir de aquí lo toma **@JulianDM22** (acceso de
escritura confirmado):

```bash
git fetch origin
git checkout feat/concursos
npm install
```

- [ ] Revisar el diff contra `main`, en especial el merge `7b0aa4f`: es donde se
      reconcilió el cálculo de nómina entre esta rama y los cambios que `main`
      recibió mientras tanto. Es el punto con más riesgo de todo el release.
- [ ] Correr la verificación por su cuenta, sin fiarse de la de aquí:
      ```bash
      npx tsc --noEmit
      npm run build
      npx vitest run                              # 423 esperados
      npm run dev                                 # en otra terminal
      node scripts/verificar-concursos-e2e.mjs    # 72/72 esperados
      node scripts/e2e-concursos.mjs              # 77/77 esperados
      ```
- [ ] Probar a mano el flujo completo en `/admin/contests`: crear, activar,
      registrar resultados, adjudicar, pagar una cuota. Comprobar que el PDF de
      nómina sigue mostrando el total **sin** propinas ni bono.
- [ ] Ejecutar los pasos 2 a 10 de [Pasos](#pasos).
- [ ] Firmar el merge a `main` con su propia identidad de git.

Su trabajo queda a su nombre porque lo hace con su cuenta: los commits de
preparación de esta rama son de `Camilo1408`, y el merge, las migraciones y la
promoción serán suyos.
