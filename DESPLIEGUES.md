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

## Alta de un cliente nuevo

1. Crear su BD Turso y aplicar el schema actual: `TURSO_DATABASE_URL=<nueva> TURSO_AUTH_TOKEN=<token> npx prisma db push`.
2. Sembrar datos iniciales según se requiera (ver `prisma/seed*.ts`).
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

Los scripts son seguros de ejecutar varias veces: si el cambio ya está aplicado,
lo detectan y lo omiten.

## Backups de BD

Ver `BACKUP.md` (dump Turso cifrado con GPG, workflow semanal + restauración).
