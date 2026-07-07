# Diseño: código base único en `main` + despliegues por env vars + promoción demo→clientes

**Fecha:** 2026-07-07
**Rama de trabajo:** `feat/codigo-base-unico-envvars` (creada desde `main`)
**Estado:** Aprobado para plan de implementación

## Problema

Hoy los despliegues salen de ramas de código distintas:

- `nomina-xpress` (demo) ← rama `main` (rama más consolidada, superconjunto).
- `cucina-fiori` (producción cliente) ← rama `deploy-fiori` (rama **vieja**, atrasada respecto a `main`).

Esto genera drift: mantener features en paralelo por rama es propenso a error y hace que cada cliente corra código distinto. Queremos:

1. **Un solo código base** (`main`) del que salgan TODOS los despliegues.
2. La diferencia entre clientes se expresa **solo con env vars** en cada proyecto de Vercel (feature flags), no con código ni ramas divergentes.
3. Flujo de release: **auto-deploy al demo** (`nomina-xpress`) en cada push a `main`; tras **aprobación manual** del demo, **promoción manual e independiente** a cada cliente.
4. **No romper cucina-fiori**: debe conservar todas las funcionalidades activas que tiene hoy.

## Hallazgos técnicos que sustentan el diseño

Verificado contra el estado actual del repo:

- **`main` es un superconjunto de `deploy-fiori` en contenido.** Los 6 commits que aparecen como "únicos" de `deploy-fiori` son duplicados (mismo cambio, otro hash) que ya están en `main`. Migrar cucina-fiori a `main` **no le quita ninguna funcionalidad**.
- **Única diferencia de schema** entre `deploy-fiori` y `main`: el modelo `InventoryCategory` (aditivo). Inerte si inventario está apagado.
- **Todo el diff de `src/` entre `deploy-fiori` y `main` es de inventario** (inventory-config, inventory-sync, permission-keys, firma de `inventoryPermissions` en `auth.ts`, botones/forms de inventario, layouts) más cambios menores en `proxy.ts`/`get-permissions.ts` ya compartidos. Todo gated por `isInventoryEnabled()`.
- **El único feature flag real hoy** es el de inventario: `isInventoryEnabled()` en `src/lib/inventory-config.ts`, que devuelve `Boolean(NEXT_PUBLIC_INVENTARIO_APP_URL)`. La marca por cliente (colores/logo) ya es por-tenant en base de datos, no es un flag de despliegue.
- **Restricción de Vercel:** `vercel.json` es un único archivo compartido por todos los proyectos (mismo repo). Los toggles de auto-deploy basados en `vercel.json` (`git.deploymentEnabled`, `github.autoAlias`) aplican por igual a demo y clientes → **no** sirven para diferenciar comportamiento por proyecto. `github.enabled=false` además apaga los Deploy Hooks. Por eso el gate de promoción se hace con **ramas puntero de producción por cliente**, que es lo que Vercel entiende de forma nativa (cada proyecto auto-deploya SU production branch).

## Arquitectura de la solución

### 1. Código base único: `main`

`main` es la única rama de desarrollo y la fuente de verdad. No se mantienen ramas de código por cliente. `deploy-fiori` se retira (ver sección 6).

### 2. Feature flags (mínimo, YAGNI)

- Nuevo módulo `src/lib/feature-flags.ts` que **centraliza** la lectura de flags de despliegue.
- **Hoy expone solo `isInventoryEnabled()`**, movido desde `src/lib/inventory-config.ts`. Para no romper imports existentes, `inventory-config.ts` se mantiene como re-export delgado (`export { isInventoryEnabled } from "./feature-flags"`) o se actualizan los ~3 call sites. Decisión concreta se toma en el plan; el comportamiento observable no cambia.
- Convención documentada para flags futuros:
  - `NEXT_PUBLIC_FEATURE_*` para flags que el bundle de cliente necesita leer.
  - Sin prefijo `NEXT_PUBLIC_` para flags server-only.
- **No se inventan flags nuevos.** Inventario sigue derivándose de `NEXT_PUBLIC_INVENTARIO_APP_URL` (ya funciona y ya está probado). El andamiaje queda listo para agregar flags cuando un cliente lo pida.
- El comportamiento de todos los despliegues actuales queda **idéntico** tras este refactor (mismo flag, misma env var, misma lógica).

### 3. Topología de despliegue

Todos los proyectos de Vercel salen del mismo repo y del mismo código:

| Proyecto Vercel | Production Branch | Auto-deploy | Rol |
|---|---|---|---|
| `nomina-xpress` (demo) | `main` | Sí (nativo) | Staging/aprobación. Inventario configurable por env. |
| `cucina-fiori` | `prod/cucina-fiori` | Sí (nativo, sobre su rama) | Cliente. Inventario OFF. |
| Cliente futuro `N` | `prod/<cliente-N>` | Sí (nativo, sobre su rama) | Cliente. Flags según necesidad. |

- La diferencia de configuración por cliente vive **solo en las Environment Variables** de cada proyecto en Vercel (flags + `TURSO_*` + `NEXTAUTH_*` + `CRON_SECRET` + Cloudinary + VAPID).

### 4. Ramas puntero de producción `prod/<cliente>`

- Una `prod/<cliente>` **NO es una rama de código**: es un **puntero de release** que siempre apunta a un commit que ya existe en `main`. Nunca tiene commits propios; el código es 100% idéntico a `main`.
- Invariante garantizado por `git merge --ff-only`: un fast-forward solo procede si la rama no ha divergido. Si alguien intentara ponerle código específico, el `--ff-only` falla → drift mecánicamente imposible.
- Analogía: un tag que se mueve. Le dice a Vercel *"qué commit de `main` desplegar y cuándo"* para ese cliente.

### 5. Flujo de release y promoción

```
main:              A─B─C─D─E─F   ← nomina-xpress (demo) auto-deploy en cada push
                       │
prod/cucina-fiori: ────┘  (corre C)
```

1. Se hace merge a `main` → **demo (`nomina-xpress`) se despliega automáticamente**.
2. Se **verifica y aprueba manualmente** el demo (humano).
3. Para promover un cliente al último `main` (p.ej. de `C` a `F`):
   ```bash
   git checkout prod/cucina-fiori
   git merge --ff-only main
   git push
   # Vercel auto-deploya cucina-fiori con el commit F
   git checkout main
   ```
4. Cada cliente se promueve **de forma independiente**, cuando corresponda (permite escalonar migraciones de BD y verificación por cliente).

**Pasos precisos de configuración en Vercel (una sola vez por proyecto cliente):**

1. Vercel → proyecto `cucina-fiori` → **Settings → Git**.
2. Cambiar **Production Branch** de `deploy-fiori` a `prod/cucina-fiori`.
3. Confirmar que el auto-deploy nativo está activo (Vercel despliega automáticamente el production branch cuando recibe commits). No se toca `vercel.json`.
4. Repetir por cada cliente nuevo con su propia `prod/<cliente>`.

> Nota: NO se pone `git.deploymentEnabled=false` ni `github.autoAlias=false` en `vercel.json`, porque son compartidos y romperían el auto-deploy del demo. El gate por cliente lo da la rama puntero, no `vercel.json`.

### 6. Corte de cucina-fiori (`deploy-fiori` → `main`) sin romper nada

Secuencia segura, con rollback trivial:

1. **Crear la rama puntero:** `git checkout main && git branch prod/cucina-fiori <commit-de-main-a-promover> && git push -u origin prod/cucina-fiori`. Inicialmente apunta al `main` verificado en demo.
2. **Env vars en Vercel (proyecto cucina-fiori):** confirmar/replicar las que ya tiene, con **inventario OFF** (NO definir `NEXT_PUBLIC_INVENTARIO_APP_URL`): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `CRON_SECRET`, `AUDIT_RETENTION_MONTHS`, `CLOUDINARY_*`, `VAPID_*`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
3. **Migración aditiva de BD** en la Turso de cucina-fiori: crear la tabla `InventoryCategory` (única diferencia de schema). Inerte con inventario OFF, pero alinea el schema con `main`. Aplicar con el mecanismo de migración del proyecto (verificar en el plan el comando exacto compatible con libsql/Turso).
4. **Cambiar Production Branch** del proyecto a `prod/cucina-fiori` (sección 5).
5. **Verificar cucina-fiori** en la URL de producción: login por username, redirecciones por rol, roles/permisos (ADMIN bloqueado de lo que corresponde), reportes quincenal/mensual, propinas, y **ausencia total de UI de inventario** (sidebar, portal nav, forms). Solo tras verificar se considera hecho el corte.
6. **Rollback:** si algo falla, reapuntar Production Branch a `deploy-fiori` (queda intacta como respaldo hasta confirmar el corte).

### 7. Limpieza de ramas

- `deploy-fiori`: **conservar como respaldo** hasta que cucina-fiori esté verificado en producción sobre `prod/cucina-fiori`/`main`. Luego archivar/borrar (remota y local).
- `local-inventory`: está detrás de `main` y ya no aporta; descartar tras confirmar que no tiene trabajo único pendiente (verificado: es casi idéntica a `main`). El trabajo de este spec se hace en `feat/codigo-base-unico-envvars` desde `main`.

## Verificación / testing

- `npm run build` y `npm test` verdes **con el flag de inventario ON y con OFF**.
- Chequeo explícito de que **cada** superficie de inventario está gated por `isInventoryEnabled()` y desaparece con el flag OFF: `AdminSidebar`, `PortalNav`, layouts admin/portal, `EmployeeForm`, `RoleForm`, `UserPermissionsForm`, rutas `api/admin/employees/[id]/inventory-access`, `api/inventory-permissions/sync`, y el sync de categorías.
- Smoke test del **demo** tras push a `main`.
- Smoke test de **cucina-fiori** tras la promoción (sección 6.5).
- Documentar en `DESPLIEGUES.md`: matriz "cliente × env var" (demo, cucina-fiori, plantilla cliente nuevo) + el runbook de promoción (comandos de sección 5 + pasos Vercel).

## Entregables

1. `src/lib/feature-flags.ts` (centraliza `isInventoryEnabled()`), con `inventory-config.ts` re-exportando o call sites actualizados. Comportamiento idéntico.
2. `DESPLIEGUES.md`: matriz de env vars por cliente + runbook de promoción + pasos Vercel + procedimiento de alta de cliente nuevo.
3. Rama `prod/cucina-fiori` (puntero) creada y empujada.
4. Migración/creación de `InventoryCategory` aplicada en la Turso de cucina-fiori.
5. Reapuntado de Production Branch de cucina-fiori a `prod/cucina-fiori` + verificación.
6. Retiro de `deploy-fiori` y `local-inventory` tras verificación.

## Fuera de alcance (YAGNI)

- Nuevos feature flags más allá de inventario (se agregan cuando un cliente los pida, sobre el andamiaje ya listo).
- Automatización CI/CD de la promoción (por ahora es el comando manual `merge --ff-only` + push; se puede automatizar después).
- Cambios de branding/tenant (ya resueltos por-tenant en BD).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Alguna superficie de inventario NO esté gated y aparezca en cucina-fiori | Chequeo explícito en verificación (lista de la sección 7) antes de aprobar el corte. |
| Migración `InventoryCategory` falla en Turso/libsql | Es aditiva y opcional (inerte con inventario OFF); rollback = reapuntar a `deploy-fiori`. Verificar comando de migración compatible en el plan. |
| Push accidental de código a `prod/<cliente>` | `--ff-only` lo impide; documentar en runbook que esas ramas son solo punteros. |
| Env var faltante en cucina-fiori tras el corte | Replicar la lista completa (sección 6.2) y verificar login + funciones antes de aprobar. |
