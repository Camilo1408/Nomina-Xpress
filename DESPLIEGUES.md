# Despliegues — Nómina Xpress

Un solo código base (`main`) alimenta TODOS los despliegues. La diferencia
entre clientes se configura **solo con Environment Variables en Vercel**
(feature flags + credenciales), nunca con ramas de código divergentes.

## Proyectos Vercel

| Proyecto Vercel | Production Branch | Auto-deploy | Rol |
|---|---|---|---|
| `nomina-xpress` (demo) | `main` | Sí | Staging y aprobación manual. |
| `cucina-fiori` | `client/cucina-fiori` | Sí (sobre su rama) | Cliente en producción. |
| `<cliente-N>` | `client/<cliente-N>` | Sí (sobre su rama) | Cliente en producción. |

Las ramas `client/<cliente>` son **punteros de release**: siempre apuntan a un
commit que ya existe en `main`, sin código propio. Se avanzan solo con
`git merge --ff-only main` (un fast-forward falla si la rama divergió, lo que
impide drift mecánicamente).

## Feature flags

| Flag | Env var | Efecto |
|---|---|---|
| Inventario | `NEXT_PUBLIC_INVENTARIO_APP_URL` | Si está definida (URL no vacía), activa el módulo de inventario (enlaces, sync, permisos) en todo el UI. Si no, queda oculto. |

Convención para flags futuros: `NEXT_PUBLIC_FEATURE_*` (cliente) / sin prefijo
(server-only). Todos se leen desde `src/lib/feature-flags.ts`.

## Matriz de env vars por cliente

| Env var | demo `nomina-xpress` | `cucina-fiori` | Notas |
|---|---|---|---|
| `TURSO_DATABASE_URL` | Turso demo | Turso cucina-fiori | BD propia por cliente |
| `TURSO_AUTH_TOKEN` | ✔ | ✔ | Token de su Turso |
| `NEXTAUTH_SECRET` | ✔ | ✔ | 32 chars |
| `NEXTAUTH_URL` | URL del demo | URL de cucina-fiori | |
| `CRON_SECRET` | ✔ | ✔ | Protege `/api/cron/audit-purge` |
| `AUDIT_RETENTION_MONTHS` | opcional (def. 6) | opcional | |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | ✔ | ✔ | Logos |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✔ | ✔ | Push |
| `NEXT_PUBLIC_INVENTARIO_APP_URL` | según demo | **NO definir** (inventario OFF) | Flag de inventario |

## Runbook de release (promoción demo → cliente)

1. Se mergea trabajo a `main` → el demo (`nomina-xpress`) se despliega solo.
2. Verificar y **aprobar manualmente** el demo (humano).
   Si el release trae un cambio de esquema, su script se corre en la BD del demo
   **antes del merge** y en la de cada cliente **antes de promoverlo** (ver
   [Cambios de esquema](#cambios-de-esquema-bd)).
3. Promover un cliente al último `main`:
   ```bash
   git checkout client/cucina-fiori
   git merge --ff-only main
   git push
   # Vercel auto-deploya cucina-fiori con ese commit
   git checkout main
   ```
4. Verificar la URL de producción del cliente.
5. Rollback si falla: en Vercel → proyecto → Deployments → **Instant Rollback**
   al deployment anterior, o reapuntar Production Branch a la rama previa.

## Recuperar el acceso de un usuario

- **Bloqueado por intentos fallidos u olvidó la clave:** PROPRIETARY o SUPERADMIN, en
  *Usuarios del portal* → menú del usuario → *Desbloquear inicio de sesión* o
  *Restablecer contraseña* (restablecer también desbloquea).
- **El PROPRIETARY olvidó su clave** (nadie puede editarlo desde la UI): con las
  credenciales de la BD del cliente,
  ```bash
  node scripts/reset-password.mjs <usuario>        # simulación
  node scripts/reset-password.mjs <usuario> --si   # aplica
  ```
  Toma la clave de `NX_PASSWORD_<USUARIO>` o genera una y la muestra una sola vez; cierra
  sus sesiones, lo desbloquea y deja el evento en la auditoría. **No** usar
  `prod-reset-users.mjs`: borra a todos los usuarios.

## Alta de un cliente nuevo

1. Crear su BD Turso y aplicar el schema actual: `TURSO_DATABASE_URL=<nueva> TURSO_AUTH_TOKEN=<token> npx prisma db push`.
2. Sembrar datos iniciales según se requiera (ver `prisma/seed*.ts`).
   Las semillas de prueba usan contraseñas públicas y **se niegan a correr contra una
   base remota** (salvo `NX_ALLOW_REMOTE_SEED=1`, solo para una instancia demo). Los
   usuarios reales se crean con `prisma/turso-setup.mjs` o `scripts/reset-users.mjs`,
   que toman cada clave de `NX_PASSWORD_<USUARIO>` o la generan al azar y la muestran
   una sola vez (`scripts/lib/credentials.mjs`). Nunca escribir contraseñas en el código.
3. Crear la rama puntero: `git branch client/<cliente> main && git push -u origin client/<cliente>`.
4. Crear el proyecto en Vercel enlazado a este repo; **Production Branch = `client/<cliente>`**.
5. Definir sus Environment Variables (matriz de arriba); activar/desactivar flags según necesidad.
6. Deploy inicial y verificación.

## Cambios de esquema (BD)

**No usar `prisma migrate deploy` ni el workflow `migrate-db.yml`.** El historial
de `prisma/migrations/` está desincronizado desde junio de 2026 y
`prisma/run-migrations.mjs` lee de ahí (ver `CLAUDE.md`).

Cada cambio de esquema lleva su propio script idempotente en `prisma/`, con el
rollback documentado en la cabecera. Se ejecutan a mano, **antes** de desplegar
el código que los necesita, contra la BD del demo primero y luego contra la de
cada cliente que se vaya a promover:

```bash
TURSO_DATABASE_URL="libsql://<cliente>.turso.io" TURSO_AUTH_TOKEN="<token>"   node prisma/turso-migrate-<nombre>.mjs
```

| Script | Cambio |
|---|---|
| `turso-migrate-tips.mjs` | Propinas |
| `turso-migrate-bonos-descuentos.mjs` | Bonos y descuentos |
| `turso-migrate-concursos.mjs` | Concursos |
| `turso-migrate-schedule-restday.mjs` | Día de descanso en horarios |
| `turso-migrate-session-version.mjs` | Revocación de sesiones: columna `User.sessionVersion` (2026-11-05) |
| `turso-migrate-login-throttle.mjs` | Límite de intentos de inicio de sesión: tabla `LoginThrottle` (2026-11-06). Si falta, el login funciona pero sin límite |

Los scripts son seguros de ejecutar varias veces: si el cambio ya está aplicado,
lo detectan y lo omiten.

> **Si el código llega antes que la migración**, la app falla al leer la tabla
> afectada. Con `sessionVersion` el síntoma es que **nadie puede iniciar sesión** y el
> formulario muestra «Usuario o contraseña incorrectos» (pasó en el demo el
> 2026-11-05). Se arregla corriendo el script; no hace falta redesplegar.
> Alternativa sin Node: el editor SQL del panel de Turso (**Edit Data**).

## Backups de BD

Ver `BACKUP.md` (dump Turso cifrado con GPG, workflow semanal + restauración).
