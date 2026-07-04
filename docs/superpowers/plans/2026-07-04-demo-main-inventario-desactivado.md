# Demo en main — integrar ramas, desactivar inventario, preparar BD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar `main` (local, sin push) como el despliegue demo: todo `deploy-fiori` + `local-inventory` integrado, inventario desactivado en el UI, y la BD Turso con esquema corregido + seed integral de 4 roles base + 1 rol personalizado.

**Architecture:** Merge de `local-inventory` (superset de `main`) forzando árbol idéntico + cherry-pick del único aporte de `deploy-fiori`. Inventario se gatea con un helper único basado en `NEXT_PUBLIC_INVENTARIO_APP_URL` (sin definir en demo). BD Turso: backup → recreación de esquema completo vía DDL generado offline por Prisma → seed adaptado.

**Tech Stack:** Next.js 16, Prisma 7 (+ `@prisma/adapter-libsql`), Turso/libSQL, `@libsql/client`, bcryptjs, git.

## Global Constraints

- Todo permanece **local en `main`**: NO `git push` a `origin`. `origin/main` intacto.
- Multi-tenant: toda inserción incluye `tenantId`.
- Credenciales demo memorizables (confirmado): ver tabla en Task 8.
- Tenant demo: **"Restaurante Demo"** (confirmado).
- `inventoryAccess = false` en todos los usuarios; sin categorías de inventario.
- Backup de la BD Turso ANTES de cualquier borrado (confirmado: reset con backup).
- Credenciales Turso (pasar por env inline, NUNCA commitear a un archivo versionado):
  - `TURSO_DATABASE_URL=libsql://nomina-xpress-db-camilo1408.aws-us-east-1.turso.io`
  - `TURSO_AUTH_TOKEN=***REMOVED***`
- Scripts `.mjs` temporales viven en la raíz del proyecto (para resolver `node_modules`) con prefijo `_` y se eliminan al terminar cada task; NUNCA se commitean.

---

### Task 1: Borrar la rama obsoleta `local`

**Files:** ninguno (operación git).

**Interfaces:**
- Consumes: nada.
- Produces: rama `local` y `origin/local` eliminadas.

- [ ] **Step 1: Confirmar que el contenido de `local` ya está en `main`**

Run:
```bash
git log --oneline main..local
```
Expected: los 2 commits (`7784339`, `f838d7c`) — ya duplicados en `main` por contenido (verificado en análisis previo).

- [ ] **Step 2: Borrar la rama local**

Run:
```bash
git branch -D local
```
Expected: `Deleted branch local (was ...)`.

- [ ] **Step 3: Borrar la rama remota `origin/local`**

Run:
```bash
git push origin --delete local
```
Expected: `- [deleted]         local`. (Esta es la ÚNICA operación remota autorizada; borra solo la rama obsoleta `local`, no toca `main`.)

- [ ] **Step 4: Verificar**

Run:
```bash
git branch -a
```
Expected: ya no aparece `local` ni `remotes/origin/local`.

---

### Task 2: Merge `local-inventory` → `main` con árbol idéntico + cherry-pick de `deploy-fiori`

**Files:** todo el árbol (operación git). Preserva `docs/superpowers/` (solo en `main`).

**Interfaces:**
- Consumes: rama `local-inventory` (superset de `main`), commit `5193507` de `deploy-fiori`.
- Produces: `main` con árbol == `local-inventory` (+ docs) y con el fix de Propinas al final.

- [ ] **Step 1: Confirmar rama y estado limpio (salvo untracked)**

Run:
```bash
git branch --show-current && git status --porcelain=v1 | grep -v '^??' || echo "working tree clean (tracked)"
```
Expected: `main` y sin cambios tracked pendientes (solo `.claude/` untracked, que se ignora).

- [ ] **Step 2: Iniciar el merge favoreciendo local-inventory, sin commitear**

Run:
```bash
git merge -X theirs --no-ff --no-commit local-inventory || true
```
Expected: prepara el merge (puede reportar conflictos autoresueltos; el `|| true` evita cortar).

- [ ] **Step 3: Forzar el árbol a ser idéntico a local-inventory**

Run:
```bash
git checkout local-inventory -- .
```
Expected: el índice/working tree toma la versión exacta de `local-inventory` para todos sus paths (no borra `docs/superpowers/`, que no existe en `local-inventory`).

- [ ] **Step 4: Completar el merge commit (sin arrastrar `.claude/` untracked)**

`git checkout local-inventory -- .` (Step 3) ya dejó en el índice todos los paths de `local-inventory` (incluidos los archivos nuevos del inventario) y resolvió los entries en conflicto. NO usar `git add -A` (arrastraría el untracked `.claude/skills/`, que no debe commitearse).

Run:
```bash
git commit --no-edit
```
Expected: crea un merge commit con dos padres (`main`, `local-inventory`). Si git reporta paths unmerged pendientes, resolverlos con `git checkout local-inventory -- <path>` (o `git checkout HEAD -- docs/superpowers` para conservar el spec) y reintentar `git commit --no-edit`. NO ejecutar `git add -A`.

- [ ] **Step 5: Verificar que el árbol de main == local-inventory (salvo docs)**

Run:
```bash
git diff --stat local-inventory HEAD
```
Expected: solo diferencias bajo `docs/superpowers/` (el spec, presente solo en `main`). Si aparece cualquier otro archivo, detenerse e investigar.

- [ ] **Step 6: Cherry-pick del fix de Propinas al final (deploy-fiori)**

Run:
```bash
git cherry-pick 5193507
```
Expected: aplica el cambio en `src/components/admin/reports/ReportsClient.tsx`. Si hay conflicto, resolver dejando la columna "Propinas" DESPUÉS de "Total final" tanto en la tabla como en los cards, luego `git add` y `git cherry-pick --continue`.

- [ ] **Step 7: Verificar el cherry-pick**

Run:
```bash
git log --oneline -3
```
Expected: el HEAD es el commit de "mover columna Propinas al final".

---

### Task 3: Helper de configuración de inventario + ocultar controles residuales

**Files:**
- Create: `src/lib/inventory-config.ts`
- Modify: `src/components/admin/employees/EmployeeForm.tsx` (sección de acceso a inventario)
- Modify: `src/components/admin/roles/RoleForm.tsx` (filtrar grupo inventory)
- Modify: `src/components/admin/usuarios/UserPermissionsForm.tsx` (filtrar grupo inventory)

**Interfaces:**
- Produces: `isInventoryEnabled(): boolean` — `true` solo si `NEXT_PUBLIC_INVENTARIO_APP_URL` está definida y no vacía.

- [ ] **Step 1: Crear el helper**

Create `src/lib/inventory-config.ts`:
```ts
// Lever único para la integración con el módulo de inventario.
// El acceso al inventario (enlaces, sync, controles de permisos) se activa
// SOLO si se define NEXT_PUBLIC_INVENTARIO_APP_URL. En el despliegue demo la
// env no se define → inventario desactivado en todo el UI, con el código
// intacto y reactivable a futuro sin cambios de código.
export function isInventoryEnabled(): boolean {
  const url = process.env.NEXT_PUBLIC_INVENTARIO_APP_URL;
  return typeof url === "string" && url.trim().length > 0;
}
```

- [ ] **Step 2: Ubicar la sección de inventario en EmployeeForm**

Run:
```bash
grep -n "inventoryAccess\|Inventario\|acceso a inventario\|Habilitar acceso" src/components/admin/employees/EmployeeForm.tsx
```
Expected: identifica el bloque JSX (aprox. líneas 355–390) que renderiza el toggle "Habilitar acceso" / badge.

- [ ] **Step 3: Envolver la sección de inventario con el flag**

En `src/components/admin/employees/EmployeeForm.tsx`:
1. Añadir el import al inicio (junto a los demás imports): `import { isInventoryEnabled } from "@/lib/inventory-config";`
2. Envolver TODO el bloque JSX de acceso a inventario con `{isInventoryEnabled() && ( ... )}`. Ejemplo de patrón:
```tsx
{isInventoryEnabled() && (
  <div /* ...bloque existente de "acceso a inventario"... */>
    {/* contenido tal cual estaba */}
  </div>
)}
```
Regla: no eliminar la lógica; solo renderizar condicionalmente. Los estados/handlers (`inventoryAccess`, `handleInventoryToggle`) pueden quedarse; solo se oculta el render.

- [ ] **Step 4: Filtrar el grupo inventory en RoleForm**

Run:
```bash
grep -n "PERMISSION_GROUPS" src/components/admin/roles/RoleForm.tsx
```
Expected: encuentra dónde se itera `PERMISSION_GROUPS`.

En `src/components/admin/roles/RoleForm.tsx`:
1. Añadir import: `import { isInventoryEnabled } from "@/lib/inventory-config";`
2. Antes del render de grupos, derivar la lista filtrada:
```tsx
const visibleGroups = PERMISSION_GROUPS.filter(
  (g) => isInventoryEnabled() || g.module !== "inventory"
);
```
3. Reemplazar el uso de `PERMISSION_GROUPS` en el `.map(...)` de render por `visibleGroups`.

- [ ] **Step 5: Filtrar el grupo inventory en UserPermissionsForm**

Aplicar el mismo patrón que Step 4 en `src/components/admin/usuarios/UserPermissionsForm.tsx`:
1. `import { isInventoryEnabled } from "@/lib/inventory-config";`
2. `const visibleGroups = PERMISSION_GROUPS.filter((g) => isInventoryEnabled() || g.module !== "inventory");`
3. Usar `visibleGroups` en el `.map(...)` de render.

- [ ] **Step 6: Verificar que no queden referencias de render a inventory sin gate**

Run:
```bash
grep -rn "module === \"inventory\"\|PERMISSION_GROUPS\b" src/components/admin/roles/RoleForm.tsx src/components/admin/usuarios/UserPermissionsForm.tsx
```
Expected: los `.map` de render usan `visibleGroups`, no `PERMISSION_GROUPS` directo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/inventory-config.ts src/components/admin/employees/EmployeeForm.tsx src/components/admin/roles/RoleForm.tsx src/components/admin/usuarios/UserPermissionsForm.tsx
git commit -m "feat(demo): desactivar UI de inventario tras helper isInventoryEnabled

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Verificación de build (tipos)

**Files:** ninguno (verificación).

**Interfaces:**
- Consumes: el árbol tras Tasks 2–3.
- Produces: confirmación de que compila.

- [ ] **Step 1: Generar el cliente Prisma (necesario para tipos)**

Run:
```bash
npx prisma generate
```
Expected: `Generated Prisma Client` en `src/generated/prisma`.

- [ ] **Step 2: Chequeo de tipos / build**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores. Si `tsc` no está configurado para el proyecto, usar `npm run build` y esperar build exitoso hasta la fase de tipos.

- [ ] **Step 3: Lint (opcional pero recomendado)**

Run:
```bash
npm run lint
```
Expected: sin errores nuevos introducidos por los cambios.

---

### Task 5: Backup de la BD Turso

**Files:**
- Create (temporal, no commitear): `_db-backup.mjs`
- Create (salida): `scratchpad/turso-backup-<timestamp>.json`

**Interfaces:**
- Produces: archivo JSON con el dump de todas las tablas actuales de Turso.

- [ ] **Step 1: Crear el script de backup**

Create `_db-backup.mjs` en la raíz del proyecto:
```js
import { createClient } from "@libsql/client";
import { writeFileSync } from "fs";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const tables = (
  await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' ORDER BY name")
).rows.map((r) => r.name);

const dump = { takenAt: new Date().toISOString(), tables: {} };
for (const t of tables) {
  const rows = (await db.execute(`SELECT * FROM "${t}"`)).rows;
  dump.tables[t] = rows.map((r) => ({ ...r }));
  console.log(`${t}: ${rows.length} filas`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = process.env.BACKUP_OUT || `turso-backup-${stamp}.json`;
writeFileSync(out, JSON.stringify(dump, null, 2));
console.log(`\n✅ Backup escrito en: ${out}`);
```

- [ ] **Step 2: Ejecutar el backup hacia scratchpad**

Run (bash):
```bash
TURSO_DATABASE_URL="libsql://nomina-xpress-db-camilo1408.aws-us-east-1.turso.io" \
TURSO_AUTH_TOKEN="<TOKEN de Global Constraints>" \
BACKUP_OUT="C:/Users/cesic/AppData/Local/Temp/claude/C--Users-cesic-Desktop-Nomina-Xpress-restaurant-nomina/da66cca7-3a3e-4379-a0a5-56fe265be552/scratchpad/turso-backup.json" \
node _db-backup.mjs
```
Expected: imprime el conteo por tabla (Tenant:1, User:5, Employee:3, TimeEntry:15, …) y `✅ Backup escrito`.

- [ ] **Step 3: Verificar el backup**

Run:
```bash
node -e "const d=require('C:/Users/cesic/AppData/Local/Temp/claude/C--Users-cesic-Desktop-Nomina-Xpress-restaurant-nomina/da66cca7-3a3e-4379-a0a5-56fe265be552/scratchpad/turso-backup.json'); console.log('tablas:', Object.keys(d.tables)); console.log('users:', d.tables.User.length);"
```
Expected: lista de tablas y `users: 5`. Si el conteo es 0 o falta una tabla con datos, detenerse.

- [ ] **Step 4: Eliminar el script temporal**

Run:
```bash
rm -f _db-backup.mjs
```
Expected: script eliminado (no se commitea).

---

### Task 6: Recrear el esquema completo en Turso (DDL offline)

**Files:**
- Create (temporal): `_schema.sql`, `_apply-schema.mjs`

**Interfaces:**
- Consumes: `prisma/schema.prisma` (ya en `main` tras el merge).
- Produces: BD Turso con TODAS las tablas del esquema objetivo (incluye `CustomRole`, `UserPermission`, `AuditLog`, `InventoryCategory` y `User` con `isActive/customRoleId/inventoryAccess`).

- [ ] **Step 1: Generar el DDL completo offline con Prisma**

Run:
```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > _schema.sql
```
Expected: `_schema.sql` con sentencias `CREATE TABLE ...` para todos los modelos. Verificar que contiene `CREATE TABLE "CustomRole"`, `"UserPermission"`, `"AuditLog"`, `"InventoryCategory"`.

Run (verificación):
```bash
grep -c "CREATE TABLE" _schema.sql && grep -o "CREATE TABLE \"[A-Za-z]*\"" _schema.sql
```
Expected: lista de todas las tablas del esquema.

- [ ] **Step 2: Crear el script que dropea todo y aplica el DDL**

Create `_apply-schema.mjs` en la raíz:
```js
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// 1. Dropear todas las tablas de usuario existentes
const existing = (
  await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'")
).rows.map((r) => r.name);
await db.execute("PRAGMA foreign_keys=OFF");
for (const t of existing) {
  await db.execute(`DROP TABLE IF EXISTS "${t}"`);
  console.log(`drop ${t}`);
}

// 2. Aplicar el DDL completo (split por ';' respetando que Prisma no usa ';' embebidos en DDL sqlite)
const sql = readFileSync("_schema.sql", "utf8");
const statements = sql
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));
for (const stmt of statements) {
  await db.execute(stmt);
}
console.log(`\n✅ Esquema aplicado: ${statements.length} sentencias`);

// 3. Verificar tablas objetivo
const after = (
  await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
).rows.map((r) => r.name);
console.log("tablas:", after.join(", "));
for (const req of ["CustomRole", "UserPermission", "AuditLog", "InventoryCategory", "User", "Tenant"]) {
  if (!after.includes(req)) throw new Error(`FALTA tabla ${req}`);
}
console.log("✅ Todas las tablas requeridas presentes");
```

- [ ] **Step 3: Ejecutar la recreación de esquema**

Run (bash, con env inline):
```bash
TURSO_DATABASE_URL="libsql://nomina-xpress-db-camilo1408.aws-us-east-1.turso.io" \
TURSO_AUTH_TOKEN="<TOKEN>" \
node _apply-schema.mjs
```
Expected: `drop ...` por cada tabla, `✅ Esquema aplicado`, lista de tablas, `✅ Todas las tablas requeridas presentes`.
Nota: este paso ya realizó el reset (drop) del contenido — el backup de Task 5 es el respaldo.

- [ ] **Step 4: Limpiar temporales**

Run:
```bash
rm -f _apply-schema.mjs _schema.sql
```
Expected: eliminados.

---

### Task 7: Adaptar y ejecutar el seed integral contra Turso

**Files:**
- Modify: `prisma/seed-local.ts`

**Interfaces:**
- Consumes: BD Turso con esquema recreado (Task 6), cliente Prisma generado (Task 4).
- Produces: 1 tenant "Restaurante Demo", 5 usuarios (4 roles base + 1 con custom role), datos de prueba en todas las tablas.

- [ ] **Step 1: Ajustar el seed — nombre de tenant, inventoryAccess=false, y usuario con custom role**

En `prisma/seed-local.ts`:

1. Tenant ya es "Restaurante Demo" — confirmar que la propiedad `name` diga exactamente `"Restaurante Demo"`.

2. Cambiar `inventoryAccess: true` de `CesarH` a `inventoryAccess: false` (inventario desactivado). El usuario `Vanessa` ya está en `false`.

3. El `customRole` "Supervisor de turno" ya se crea. Capturar su retorno y crear un usuario asignado. Reemplazar el bloque:
```ts
  console.log("🛡️  Creando rol personalizado de prueba...");
  await prisma.customRole.create({
    data: {
      tenantId: tenant.id,
      name: "Supervisor de turno",
      slug: "supervisor-turno",
      description: "Puede registrar horas y ver reportes, sin gestión de personal",
      permissions: JSON.stringify([
        "time_entries:view",
        "time_entries:create",
        "time_entries:edit",
        "schedules:view",
        "tips:view",
        "payroll:view",
      ]),
      isSystem: false,
      active: true,
    },
  });
```
por:
```ts
  console.log("🛡️  Creando rol personalizado de prueba...");
  const supervisorRole = await prisma.customRole.create({
    data: {
      tenantId: tenant.id,
      name: "Supervisor de turno",
      slug: "supervisor-turno",
      description: "Puede registrar horas y ver reportes, sin gestión de personal",
      permissions: JSON.stringify([
        "time_entries:view",
        "time_entries:create",
        "time_entries:edit",
        "schedules:view",
        "tips:view",
        "payroll:view",
      ]),
      isSystem: false,
      active: true,
    },
  });

  console.log("🧑‍🔧 Creando usuario con rol personalizado...");
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "SupervisorDemo",
      passwordHash: await bcrypt.hash("Supervisor123", 12),
      role: "EMPLOYEE",
      customRoleId: supervisorRole.id,
      inventoryAccess: false,
    },
  });
```

4. Actualizar el bloque de resumen `console.log` final para incluir:
```ts
  console.log("   SupervisorDemo / Supervisor123 → EMPLOYEE + CustomRole 'Supervisor de turno'");
```
y corregir la línea de `CesarH` para reflejar `inventoryAccess=false`.

- [ ] **Step 2: Verificar que el seed borra todas las tablas antes de insertar**

Run:
```bash
grep -n "deleteMany" prisma/seed-local.ts
```
Expected: incluye `auditLog`, `userPermission`, `customRole`, `tenant`, `user`, `employee`, y todas las demás. (Ya recreamos el esquema vacío en Task 6, así que los `deleteMany` operarán sobre tablas vacías — es idempotente y seguro.)

- [ ] **Step 3: Ejecutar el seed contra Turso**

Run (bash, env inline):
```bash
TURSO_DATABASE_URL="libsql://nomina-xpress-db-camilo1408.aws-us-east-1.turso.io" \
TURSO_AUTH_TOKEN="<TOKEN>" \
npx tsx prisma/seed-local.ts
```
Expected: la secuencia de logs (`🧹 Limpiando`, `🏗️ Creando tenant`, `👥`, `⏱️`, `💰`, `📅`, `🎁`, `➖`, `💵`, `🛡️`, `🧑‍🔧`, `✅ Seed completado`) y la tabla-resumen con los 5 usuarios.

- [ ] **Step 4: Commit del seed ajustado**

```bash
git add prisma/seed-local.ts
git commit -m "chore(demo): seed integral Turso — 4 roles base + rol personalizado, inventario off

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Verificación final de la BD y entregables

**Files:**
- Create (temporal): `_verify.mjs`

**Interfaces:**
- Consumes: BD Turso sembrada.
- Produces: confirmación de estado + entregables al usuario.

- [ ] **Step 1: Crear script de verificación**

Create `_verify.mjs` en la raíz:
```js
import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function count(t) { return (await db.execute(`SELECT COUNT(*) n FROM "${t}"`)).rows[0].n; }

console.log("=== CONTEOS ===");
for (const t of ["Tenant","User","Employee","CustomRole","UserPermission","TimeEntry","Schedule","ScheduleShift","Bonus","BonusAssignment","Discount","DiscountAssignment","PayAdjustment","TipEntry","TipDistribution","InventoryCategory"]) {
  console.log(`${t}: ${await count(t)}`);
}

console.log("\n=== USUARIOS ===");
const users = (await db.execute(`
  SELECT u.username, u.role, u.inventoryAccess, u.isActive, c.name AS customRole
  FROM User u LEFT JOIN CustomRole c ON u.customRoleId = c.id
`)).rows;
for (const u of users) console.log(JSON.stringify(u));

console.log("\n=== ROL PERSONALIZADO ===");
const cr = (await db.execute(`SELECT name, slug, permissions FROM CustomRole`)).rows;
for (const r of cr) console.log(JSON.stringify(r));
```

- [ ] **Step 2: Ejecutar la verificación**

Run:
```bash
TURSO_DATABASE_URL="libsql://nomina-xpress-db-camilo1408.aws-us-east-1.turso.io" \
TURSO_AUTH_TOKEN="<TOKEN>" \
node _verify.mjs
```
Expected:
- `Tenant: 1`, `User: 5`, `CustomRole: 1`, `UserPermission: 1`, `InventoryCategory: 0`.
- Conteos > 0 en `TimeEntry`, `Schedule`, `ScheduleShift`, `Bonus`, `BonusAssignment`, `Discount`, `DiscountAssignment`, `PayAdjustment`, `TipEntry`, `TipDistribution`.
- 5 usuarios con roles: PROPRIETARY, SUPERADMIN, ADMIN, EMPLOYEE, y `SupervisorDemo` con `customRole = "Supervisor de turno"`.
- Todos `inventoryAccess = 0` (false).

- [ ] **Step 3: Limpiar temporal**

Run:
```bash
rm -f _verify.mjs
```

- [ ] **Step 4: Confirmar estado git final (sin push)**

Run:
```bash
git status && git log --oneline -8 && echo "--- origin/main intacto ---" && git log --oneline origin/main -1
```
Expected: `main` con los commits de merge + inventario off + seed; `origin/main` en `1c773ea` (sin cambios). Solo `.claude/` untracked.

- [ ] **Step 5: Entregar al usuario**

Reportar:
- **5 usuarios / contraseñas / rol:**
  | Usuario | Contraseña | Rol |
  |---|---|---|
  | `SadminJavier` | `Javier123` | PROPRIETARY |
  | `SadminMajo` | `Majo123` | SUPERADMIN |
  | `AdminValen` | `Valen123` | ADMIN |
  | `CesarH` | `CesarH123` | EMPLOYEE |
  | `SupervisorDemo` | `Supervisor123` | Rol personalizado "Supervisor de turno" |
- Ubicación del backup: `scratchpad/turso-backup.json`.
- Resumen de esquema: tablas creadas (`CustomRole`, `UserPermission`, `AuditLog`, `InventoryCategory`) + columnas `User.isActive/customRoleId/inventoryAccess`.
- `main` local con todo integrado, inventario desactivado; **sin push** (pendiente de tu revisión para desplegar).

---

## Notas de verificación cruzada con el spec

- §1 Git (borrar `local`, merge, cherry-pick) → Tasks 1–2.
- §2 Desactivar inventario (helper + EmployeeForm + RoleForm + UserPermissionsForm) → Task 3.
- §3 BD (backup, esquema, reset+seed) → Tasks 5–7.
- §4 Verificación (build, DB, git diff) → Tasks 4, 8.
- Entregables (5 usuarios, backup, resumen) → Task 8 Step 5.
