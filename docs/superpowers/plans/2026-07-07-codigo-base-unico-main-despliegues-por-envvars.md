# Código base único en `main` + despliegues por env vars — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar todo el código en `main`, configurar cada despliegue de cliente solo con env vars (feature flags), y mover cucina-fiori de la rama `deploy-fiori` a `main` mediante una rama puntero `client/cucina-fiori`, sin perder funcionalidades y sin tocar la producción viva hasta respaldar y verificar.

**Architecture:** Un solo código base (`main`). Los flags de despliegue se leen desde un módulo único `src/lib/feature-flags.ts`. El demo (`nomina-xpress`) auto-deploya `main`; cada cliente tiene una rama puntero `client/<cliente>` (fast-forward, sin código propio) que Vercel auto-deploya como su Production Branch. La diferencia por cliente vive solo en las Environment Variables de Vercel.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Vitest, Prisma 7 (+ `@prisma/adapter-better-sqlite3` / libsql-Turso en prod), Vercel, Turso CLI, git.

## Global Constraints

- **TypeScript strict, cero `any`.** (CLAUDE.md regla 2)
- **Multi-tenant siempre:** toda query filtra por `tenantId` desde session. (regla 1)
- **Server Components por defecto;** `"use client"` solo con hooks/handlers. (regla 5)
- **Tests con Vitest**, environment `node`, alias `@` → `src` (ver `vitest.config.ts`). Tests en `src/lib/__tests__/`.
- **Comportamiento observable idéntico** tras el refactor de flags: mismo flag, misma env var (`NEXT_PUBLIC_INVENTARIO_APP_URL`), misma lógica `Boolean(url no vacía)`.
- **`deploy-fiori` está EN VIVO para un cliente real.** No se modifica, reapunta ni borra hasta completar la Fase 0 de respaldos Y verificar el corte Y tener confirmación explícita del usuario.
- **Fase B (cutover) requiere credenciales** (Vercel dashboard, `TURSO_AUTH_TOKEN` de cucina-fiori) y **aprobación humana en cada gate**; no se ejecuta de forma autónoma.
- Spec de referencia: `docs/superpowers/specs/2026-07-07-codigo-base-unico-main-despliegues-por-envvars-design.md`.

---

## FASE A — Código y documentación (rama `feat/codigo-base-unico-envvars`)

### Task 1: Centralizar feature flags en `src/lib/feature-flags.ts`

**Files:**
- Create: `src/lib/feature-flags.ts`
- Test: `src/lib/__tests__/feature-flags.test.ts`
- Modify: `src/components/admin/usuarios/UserPermissionsForm.tsx:14` (import)
- Modify: `src/components/admin/employees/EmployeeForm.tsx:11` (import)
- Modify: `src/components/admin/roles/RoleForm.tsx:15` (import)
- Delete: `src/lib/inventory-config.ts`

**Interfaces:**
- Produces: `isInventoryEnabled(): boolean` — `true` solo si `process.env.NEXT_PUBLIC_INVENTARIO_APP_URL` está definida y no vacía (tras `trim`). Importable desde `@/lib/feature-flags`.
- Consumes: nada (primer task).

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/feature-flags.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { isInventoryEnabled } from "@/lib/feature-flags";

const KEY = "NEXT_PUBLIC_INVENTARIO_APP_URL";

describe("isInventoryEnabled", () => {
  const original = process.env[KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("returns false when the env var is undefined", () => {
    delete process.env[KEY];
    expect(isInventoryEnabled()).toBe(false);
  });

  it("returns false when the env var is empty or whitespace", () => {
    process.env[KEY] = "   ";
    expect(isInventoryEnabled()).toBe(false);
  });

  it("returns true when the env var has a non-empty value", () => {
    process.env[KEY] = "https://inventario.example.com";
    expect(isInventoryEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- feature-flags`
Expected: FAIL — no puede resolver `@/lib/feature-flags` (módulo no existe todavía).

- [ ] **Step 3: Create the module**

Create `src/lib/feature-flags.ts`:

```ts
// Punto único para leer feature flags de despliegue (por cliente, vía env vars).
//
// Convención de nombres:
//   - NEXT_PUBLIC_FEATURE_*   → flags que el bundle de cliente necesita leer.
//   - sin prefijo NEXT_PUBLIC → flags server-only.
//
// Hoy el único flag es el de inventario, derivado de NEXT_PUBLIC_INVENTARIO_APP_URL:
// si está definida (y no vacía), el módulo de inventario (enlaces, sync, controles
// de permisos) se activa en todo el UI. Si no, queda oculto con el código intacto
// y reactivable sin cambios de código. Se configura por proyecto en Vercel.
export function isInventoryEnabled(): boolean {
  const url = process.env.NEXT_PUBLIC_INVENTARIO_APP_URL;
  return typeof url === "string" && url.trim().length > 0;
}
```

- [ ] **Step 4: Update the 3 call sites**

En cada archivo, reemplazar el import `from "@/lib/inventory-config"` por `from "@/lib/feature-flags"` (el nombre importado `isInventoryEnabled` no cambia):

- `src/components/admin/usuarios/UserPermissionsForm.tsx` línea 14:
  `import { isInventoryEnabled } from "@/lib/feature-flags";`
- `src/components/admin/employees/EmployeeForm.tsx` línea 11:
  `import { isInventoryEnabled } from "@/lib/feature-flags";`
- `src/components/admin/roles/RoleForm.tsx` línea 15:
  `import { isInventoryEnabled } from "@/lib/feature-flags";`

- [ ] **Step 5: Delete the old module**

Run: `git rm src/lib/inventory-config.ts`

- [ ] **Step 6: Verify no lingering references**

Run: `git grep -n "inventory-config"` (excluyendo `docs/`)
Expected: sin resultados en `src/`. Si aparece alguno, actualizar ese import a `@/lib/feature-flags`.

- [ ] **Step 7: Run tests + build**

Run: `npm test -- feature-flags`
Expected: PASS (3 tests).

Run: `npm run build`
Expected: build OK, sin errores de TypeScript ni de módulos no resueltos.

- [ ] **Step 8: Commit**

```bash
git add src/lib/feature-flags.ts src/lib/__tests__/feature-flags.test.ts \
  src/components/admin/usuarios/UserPermissionsForm.tsx \
  src/components/admin/employees/EmployeeForm.tsx \
  src/components/admin/roles/RoleForm.tsx
git rm src/lib/inventory-config.ts
git commit -m "refactor(flags): centralizar feature flags en src/lib/feature-flags.ts

Mueve isInventoryEnabled a un módulo único de flags de despliegue y
actualiza los 3 call sites. Comportamiento idéntico (misma env var
NEXT_PUBLIC_INVENTARIO_APP_URL). Deja el andamiaje para flags futuros.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Documentar despliegues y runbook en `DESPLIEGUES.md`

**Files:**
- Create: `DESPLIEGUES.md` (raíz del repo)

**Interfaces:**
- Consumes: la convención de flags de Task 1 y el mecanismo de promoción del spec.
- Produces: documento de referencia; sin dependencias de código.

- [ ] **Step 1: Create `DESPLIEGUES.md`**

Create `DESPLIEGUES.md` con este contenido:

````markdown
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

## Backups de BD

Ver `BACKUP.md` (dump Turso cifrado con GPG, workflow semanal + restauración).
````

- [ ] **Step 2: Review render**

Run: revisar `DESPLIEGUES.md` en un visor Markdown (o `cat DESPLIEGUES.md`) y confirmar que las tablas se ven bien y no quedan celdas vacías por error.

- [ ] **Step 3: Commit**

```bash
git add DESPLIEGUES.md
git commit -m "docs(despliegues): matriz de env vars por cliente + runbook de promoción

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Integrar a `main` y verificar el demo

**Files:** ninguno (integración git + verificación en Vercel).

**Interfaces:**
- Consumes: rama `feat/codigo-base-unico-envvars` con Tasks 1–2.
- Produces: `main` actualizado; demo `nomina-xpress` desplegado con el refactor.

- [ ] **Step 1: Asegurar árbol limpio y tests verdes**

Run: `npm test`
Expected: toda la suite PASS (incluye `feature-flags` y los 3 forms que usan el flag).

Run: `git status`
Expected: sin cambios sin commitear en `src/`.

- [ ] **Step 2: Merge a `main`**

```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff feat/codigo-base-unico-envvars -m "merge: código base único + feature-flags centralizados + DESPLIEGUES.md"
```

- [ ] **Step 3: Push (dispara auto-deploy del demo)**

Run: `git push origin main`
Expected: push OK. Vercel comienza a desplegar `nomina-xpress`.

- [ ] **Step 4: Verificar el demo desplegado**

En https://nomina-xpress.vercel.app:
- Login por username (p.ej. `admin` / `admin123`).
- Confirmar que el UI carga sin errores.
- Confirmar que **NO aparece UI de inventario** (el demo no define `NEXT_PUBLIC_INVENTARIO_APP_URL`): sin botón Inventario en sidebar/portal ni matriz de permisos de inventario en los forms de roles/usuarios/empleados.
- Reportes quincenal/mensual y propinas funcionan.

Expected: comportamiento idéntico al de antes del refactor. Si algo falla, corregir en una rama nueva desde `main` y repetir. **Este es el gate de aprobación del demo** antes de tocar cualquier cliente.

---

## FASE B — Corte de cucina-fiori (runbook, requiere credenciales + aprobación humana)

> ⚠️ **Cada task de esta fase toca producción real de un cliente.** Ejecutar CON el usuario, con acceso a Vercel y a las credenciales Turso de cucina-fiori. No continuar al siguiente task sin verificar el actual. `deploy-fiori` no se toca en toda la fase.

### Task 4: Fase 0 — Respaldos obligatorios

**Files:** ninguno en el repo (genera un tag remoto y un `.sql` fuera del repo).

- [ ] **Step 1: Tag inmutable del commit publicado de cucina-fiori**

```bash
git fetch origin
git tag backup/deploy-fiori-2026-07-07 origin/deploy-fiori
git push origin backup/deploy-fiori-2026-07-07
```

- [ ] **Step 2: Verificar el tag en remoto**

Run: `git ls-remote --tags origin | grep backup/deploy-fiori-2026-07-07`
Expected: una línea con el hash del commit de `deploy-fiori`.

- [ ] **Step 3: Dump de la BD de producción de cucina-fiori**

Obtener la `TURSO_DATABASE_URL` de cucina-fiori desde Vercel → proyecto `cucina-fiori` → Settings → Environment Variables. Luego (Turso CLI autenticado con el token de cucina-fiori):

```bash
turso db shell "<CUCINA_FIORI_TURSO_URL>" ".dump" > backup-cucina-fiori-2026-07-07.sql
```

Guardar el `.sql` FUERA del repo (gestor de secretos / almacenamiento seguro).

- [ ] **Step 4: Verificar el dump**

```bash
sqlite3 /tmp/verify-fiori.db < backup-cucina-fiori-2026-07-07.sql
sqlite3 /tmp/verify-fiori.db "SELECT COUNT(*) FROM User; SELECT COUNT(*) FROM TimeEntry;"
rm /tmp/verify-fiori.db
```

Expected: conteos > 0 (la BD tiene datos reales del cliente). Si el dump está vacío o falla, NO continuar.

- [ ] **Step 5: Registrar el estado de Vercel para rollback**

En Vercel → `cucina-fiori` → Deployments: anotar el **deployment ID / URL** del que está marcado como Production/Current (para Instant Rollback). En Settings → Environment Variables: anotar/exportar la lista actual de variables como referencia.

- [ ] **Step 6: Gate de respaldos**

Confirmar que existen los tres: (1) tag en remoto, (2) `.sql` verificado con filas, (3) deployment de rollback anotado. **Sin los tres, no se procede a Task 5.**

---

### Task 5: Crear la rama puntero `client/cucina-fiori`

**Files:** ninguno en el árbol (crea una rama).

**Interfaces:**
- Consumes: `main` verificado en el demo (Task 3, Step 4).
- Produces: rama remota `client/cucina-fiori` apuntando a ese commit de `main`.

- [ ] **Step 1: Crear la rama en el commit de `main` aprobado**

```bash
git checkout main
git pull --ff-only origin main
git branch client/cucina-fiori main
git push -u origin client/cucina-fiori
```

- [ ] **Step 2: Verificar**

Run: `git log --oneline -1 client/cucina-fiori` y `git log --oneline -1 main`
Expected: **mismo hash** (la rama puntero == `main`).

---

### Task 6: Migración aditiva `InventoryCategory` en la BD de cucina-fiori

**Files:**
- Create (temporal, fuera del repo): `inventory-category.sql`

**Interfaces:**
- Consumes: la `TURSO_DATABASE_URL` de cucina-fiori.
- Produces: tabla `InventoryCategory` en la BD de cucina-fiori (inerte con inventario OFF; alinea el schema con `main`).

- [ ] **Step 1: Crear el archivo SQL (DDL exacta generada por Prisma)**

Create `inventory-category.sql` (fuera del repo, p.ej. en el scratchpad):

```sql
CREATE TABLE "InventoryCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "InventoryCategory_tenantId_active_idx" ON "InventoryCategory"("tenantId", "active");
CREATE UNIQUE INDEX "InventoryCategory_tenantId_slug_key" ON "InventoryCategory"("tenantId", "slug");
```

- [ ] **Step 2: Confirmar que la tabla NO existe aún (pre-check)**

```bash
turso db shell "<CUCINA_FIORI_TURSO_URL>" "SELECT name FROM sqlite_master WHERE type='table' AND name='InventoryCategory';"
```

Expected: vacío (no existe). Si ya existiera, saltar a Step 4 (idempotencia) y verificar el esquema.

- [ ] **Step 3: Aplicar la migración**

```bash
turso db shell "<CUCINA_FIORI_TURSO_URL>" < inventory-category.sql
```

Expected: sin errores.

- [ ] **Step 4: Verificar la tabla y su esquema**

```bash
turso db shell "<CUCINA_FIORI_TURSO_URL>" ".schema InventoryCategory"
turso db shell "<CUCINA_FIORI_TURSO_URL>" "SELECT COUNT(*) FROM InventoryCategory;"
```

Expected: el `.schema` coincide con la DDL de Step 1; el conteo es `0`. La tabla es inerte mientras inventario esté OFF.

- [ ] **Step 5: Limpiar el archivo temporal**

Run: `rm inventory-category.sql`

---

### Task 7: Reapuntar Vercel a `client/cucina-fiori` y verificar producción

**Files:** ninguno (configuración de Vercel + verificación).

- [ ] **Step 1: Confirmar env vars de cucina-fiori (inventario OFF)**

En Vercel → `cucina-fiori` → Settings → Environment Variables, confirmar que están todas las de la matriz de `DESPLIEGUES.md` y que **`NEXT_PUBLIC_INVENTARIO_APP_URL` NO está definida** (inventario apagado). No cambiar `TURSO_*` (siguen apuntando a la BD del cliente).

- [ ] **Step 2: Cambiar Production Branch**

En Vercel → `cucina-fiori` → Settings → Git → **Production Branch**: cambiar de `deploy-fiori` a `client/cucina-fiori`. Guardar. (No se toca `vercel.json`.)

- [ ] **Step 3: Disparar el deploy de producción**

Opción A: hacer un push trivial que avance `client/cucina-fiori` (si ya está en el commit deseado, en Vercel → Deployments → **Redeploy** del último commit de `client/cucina-fiori` marcándolo como Production).
Opción B: `git checkout client/cucina-fiori && git commit --allow-empty -m "chore: trigger deploy cucina-fiori en client/cucina-fiori" && git push && git checkout main` (solo si se necesita forzar el trigger).

Expected: Vercel construye y publica cucina-fiori desde `client/cucina-fiori`.

- [ ] **Step 4: Verificar cucina-fiori en producción**

En la URL de producción de cucina-fiori:
- Login por username (credenciales del cliente).
- Redirecciones por rol correctas.
- Roles/permisos: ADMIN bloqueado de lo que corresponde; PROPRIETARY/SUPERADMIN OK.
- Reportes quincenal y mensual generan bien; propinas correctas.
- **Ausencia total de UI de inventario:** sin botón Inventario en `AdminSidebar` ni `PortalNav`; sin matriz de permisos de inventario en `EmployeeForm`, `RoleForm`, `UserPermissionsForm`.
- Sin errores en consola del navegador ni en los logs de la función en Vercel.

Expected: todas las funcionalidades que el cliente ya tenía siguen activas e idénticas. **Este es el gate del corte.**

- [ ] **Step 5: Rollback documentado (solo si algo falla)**

- Reapuntar Production Branch a `deploy-fiori` (intacta), o Instant Rollback al deployment anotado en Task 4 Step 5.
- Si la migración de BD causó el problema (improbable, es aditiva): restaurar desde `backup-cucina-fiori-2026-07-07.sql` según `BACKUP.md`.

---

### Task 8: Retiro de ramas obsoletas (solo tras verificación estable + confirmación del usuario)

**Files:** ninguno (limpieza de ramas).

> No ejecutar hasta que cucina-fiori lleve un periodo estable en `client/cucina-fiori` **y** el usuario lo confirme explícitamente. El tag `backup/deploy-fiori-2026-07-07` permanece siempre.

- [ ] **Step 1: Confirmar con el usuario**

Preguntar explícitamente si se procede a borrar `deploy-fiori` y `local-inventory`. Si no, dejar como están.

- [ ] **Step 2: Borrar `deploy-fiori` (remota y local)**

```bash
git push origin --delete deploy-fiori
git branch -D deploy-fiori
```

Expected: el tag `backup/deploy-fiori-2026-07-07` sigue existiendo (`git ls-remote --tags origin | grep backup/deploy-fiori`).

- [ ] **Step 3: Borrar `local-inventory` (remota y local)**

```bash
git push origin --delete local-inventory
git branch -D local-inventory
```

- [ ] **Step 4: Verificar ramas finales**

Run: `git branch -a`
Expected: quedan `main`, `client/cucina-fiori` (y ramas de trabajo activas). Sin `deploy-fiori` ni `local-inventory`.

---

## Self-review checklist (para quien ejecuta)

- [ ] `npm run build` y `npm test` verdes con inventario OFF (default) — Tasks 1, 3.
- [ ] Opcional: probar en local con inventario ON (`NEXT_PUBLIC_INVENTARIO_APP_URL=http://localhost:3001 npm run build`) para confirmar que el flag sigue activando el UI.
- [ ] Los 3 call sites importan de `@/lib/feature-flags`; `inventory-config.ts` eliminado; sin referencias colgantes en `src/`.
- [ ] Respaldos Fase 0 verificados antes de tocar cucina-fiori.
- [ ] `client/cucina-fiori` == `main` (mismo hash) al crearse.
- [ ] `InventoryCategory` creada y vacía en la BD de cucina-fiori.
- [ ] cucina-fiori en producción sin UI de inventario y con todas sus funciones.
- [ ] `deploy-fiori` intacta hasta confirmación explícita del usuario.
