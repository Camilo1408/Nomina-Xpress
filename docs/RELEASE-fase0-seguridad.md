# Release — Fase 0 de seguridad

Corrección de los hallazgos críticos de la auditoría del 2026-11-05 (Plan de Calidad
v3.2, sección 6.4.12). Reglas generales en [DESPLIEGUES.md](../DESPLIEGUES.md).

> **Estado: desplegado en producción el 2026-11-05.** PR #12 (`faf41b0`), más las
> actualizaciones de Dependabot #13 (`5e13ff7`) y #14 (`319db0c`). El demo y Cucina dei
> Fiori quedaron migrados y desplegados ese mismo día. El detalle está en
> [Registro del release](#registro-del-release).

## Qué entra

| # | Cambio | Efecto visible |
|---|---|---|
| 1 | Revocación de sesiones (RN-19): `User.sessionVersion` + `src/lib/session-guard.ts` | Desactivar a un usuario o cambiarle la contraseña, el usuario o el rol cierra sus sesiones abiertas en su siguiente request |
| 2 | Sesión de 12 h, renovada cada hora | Antes la sesión duraba 30 días y se renovaba sola con el uso |
| 3 | Usuarios inactivos sin permisos efectivos | Defensa adicional: un token vivo de un usuario desactivado no autoriza nada |
| 4 | La auditoría de `PUT /api/admin/users/[id]` ya no guarda el hash de la contraseña | El registro muestra `password: "(cambiada)"` |
| 5 | Contraseñas fuera del código (`scripts/lib/credentials.mjs`) | Los scripts operativos leen `NX_PASSWORD_<USUARIO>` o generan una clave aleatoria y la muestran una sola vez |
| 6 | Semillas de prueba bloqueadas contra bases remotas | `seed.ts` y `seed-local.ts` exigen `NX_ALLOW_REMOTE_SEED=1` fuera de `file:` |
| 7 | `next` 16.4.5, `next-auth` 5.0.0-beta.32, sin `@auth/prisma-adapter`, `shadcn` como devDependency, `npm audit fix`, `brace-expansion` 1.1.21 y `js-yaml` 4.3.2 | Dependencias de producción: de 41 vulnerabilidades (5 críticas) a 5 (0 críticas, 0 altas) |

Fuera del código, el mismo día: las contraseñas expuestas se cambiaron en producción, se
activaron secret scanning, push protection y Dependabot, y se rotó la passphrase de los
backups (ver [BACKUP.md](../BACKUP.md)).

## Cambio de base de datos

**Sí lo hay.** Script idempotente: `prisma/turso-migrate-session-version.mjs`.

```sql
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
```

- Es aditivo: todas las filas quedan en 0 y los tokens emitidos antes (sin `sv`) cuentan
  como versión 0, así que la migración **no cierra la sesión de nadie**.
- **Rollback:** `ALTER TABLE "User" DROP COLUMN "sessionVersion";`. No hace falta para
  volver al código anterior: ese código no lee la columna.
- **Orden obligatorio:** migrar la base **antes** de que le llegue el código. Si no,
  Prisma falla al leer `User` y nadie puede iniciar sesión.

## Verificación hecha en local

> **Corrección (06/11/2026):** este documento decía 456 pruebas en 33 archivos. Vitest
> también recogía 7 archivos de una copia de trabajo de un agente en `.claude/worktrees/`;
> el conjunto real del repositorio es de 386 pruebas en 26 archivos. `vitest.config.ts`
> ahora excluye `.claude/`.

| Comprobación | Resultado |
|---|---|
| `npx vitest run` | **386/386** en 26 archivos; 21 casos nuevos (`[RN-19]`, `[CP-43]`, `[CP-44]`, `[CP-54]`) |
| `npx tsc --noEmit` | limpio |
| `next build` | compila sin errores |
| Prueba de punta a punta contra `localhost` | Al desactivar un ADMIN su sesión pasa a `null` y la API lo rechaza; la sesión del PROPRIETARY sigue activa; al reactivarlo la cookie vieja no revive y un login nuevo funciona |
| `npx eslint src` | 7 errores, los mismos de `main` (`react-hooks/set-state-in-effect`) |
| #13 y #14 instalados desde cero (`npm ci`) | 386/386, `tsc` limpio, build correcto, ESLint funciona con `js-yaml` 4.3.2 |

## Riesgos conocidos

1. **Inventory Xpress no verifica `sessionVersion`.** Valida el JWT por su cuenta; una
   sesión revocada sigue viva allá hasta que la cookie expira (máx. 12 h) o hasta que el
   usuario vuelve a pasar por nómina, que borra la cookie.
2. **Las contraseñas retiradas siguen en el historial de git.** Lo que cierra el riesgo es
   que se cambiaron; reescribir el historial queda como decisión pendiente.
3. **El login muestra «Usuario o contraseña incorrectos» ante cualquier error**, incluido
   un fallo de base de datos. Confundió el diagnóstico del paso 4 del registro. Queda para
   la Fase 1.
4. **La CSP bloquea Google Fonts** (ya pasaba antes de este release).

## Registro del release

Horas en UTC, 2026-11-05.

| Paso | Hora | Qué se hizo | Resultado |
|---|---|---|---|
| 1 | 17:24 | Backup manual (`backup-db.yml`, ejecución `42074043553`) con la passphrase nueva | Correcto. Primer backup restaurable con la frase nueva; se verificó con una restauración local |
| 2 | 17:48 | Merge de #12 a `main` (`faf41b0`, squash) | Demo desplegado a las 17:50 |
| 3 | 17:50 | Dependabot cerró solo #6 a #11 | Esas versiones ya venían en #12 |
| 4 | después de 17:50 | **Demo sin la columna:** el login fallaba con «Usuario o contraseña incorrectos» | Se creó `sessionVersion` en la base del demo desde el editor SQL de Turso. Login verificado por el propietario |
| 5 | 18:34 | Merge de #13 (`brace-expansion`) | `5e13ff7` |
| 6 | 18:58 | Rebase de #14 por Dependabot y merge (`js-yaml`) | `319db0c`. Checks de Vercel en verde |
| 7 | antes de 23:09 | Migrar Cucina dei Fiori con `turso-migrate-session-version.mjs` | Columna creada, todos los usuarios en versión 0 |
| 8 | 23:09 | Promover el cliente: `client/cucina-fiori` con `--ff-only` de `862a9f7` a `319db0c` | Producción desplegada a las 23:09 |
| 9 | 23:09 en adelante | Verificar producción | Login y página de sesión responden 200; el propietario confirmó inicio de sesión y acceso al inventario |

### Lección

El paso 4 pasó porque el merge se hizo antes de migrar el demo. Desde este release,
`DESPLIEGUES.md` y `CLAUDE.md` (regla 8) exigen migrar el demo **antes del merge**, y el
Plan de Calidad lo controla con la compuerta **G14**.
