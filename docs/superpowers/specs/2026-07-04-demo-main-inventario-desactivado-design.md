# Demo en `main`: integrar ramas, desactivar inventario y preparar BD

**Fecha:** 2026-07-04
**Rama objetivo:** `main` (despliegue demo — cambios quedan **locales**, sin push)

## Objetivo

Dejar `main` como el despliegue demo de Nómina Xpress con:
1. Todo el trabajo de `deploy-fiori` y `local-inventory` integrado.
2. La integración con el módulo de inventario **desactivada** (no hay dominio propio para interconectar).
3. La BD demo (Turso) con esquema corregido y datos de prueba en todas las tablas, incluyendo 4 perfiles (uno por rol base) + 1 perfil con rol personalizado editado.

## Contexto / hallazgos

- **Ramas:** `main` y `local-inventory` divergieron (ancestro común `d33bee9`).
  - `local-inventory` contiene el **100% de los archivos de `main`** más el sistema de inventario y commits posteriores de `deploy-fiori` (verificado: no hay archivos exclusivos de `main`).
  - Único aporte de `deploy-fiori` ausente en todo: commit `5193507` (mover columna "Propinas" al final de la tabla de reportes).
  - Rama `local`: obsoleta; sus 2 commits ya están en `main` por contenido.
- **Gate de inventario:** todo el acceso está condicionado a la env `NEXT_PUBLIC_INVENTARIO_APP_URL`.
  - Sidebar (`AdminSidebar.tsx`): `showInventario = Boolean(inventarioUrl) && permSet.has(INVENTORY_VIEW)`.
  - Portal (`portal/layout.tsx` + `PortalNav.tsx`): enlace solo si `inventoryAccess` y la env están presentes.
  - `inventory-sync.ts`: `if (!INVENTORY_URL) return getMirroredCategories(...)` → tolerante, sin llamadas externas.
  - Controles residuales que NO dependen de la env: toggle de acceso en `EmployeeForm.tsx` y el grupo `inventory` de `PERMISSION_GROUPS` en `RoleForm.tsx` y `UserPermissionsForm.tsx`.
- **BD Turso (estado actual):** tenant "Cucina dei Fiori", 5 usuarios, 3 empleados, 15 registros de horas, propinas.
  - **Faltan tablas:** `CustomRole`, `UserPermission`, `AuditLog`, `InventoryCategory`.
  - **Faltan columnas en `User`:** `isActive`, `customRoleId`, `inventoryAccess`.
  - Sin corregir el esquema, la app crashea (consulta tablas/columnas inexistentes).
- **Modelo de permisos** (`get-permissions.ts`): PROPRIETARY = todos; si el usuario tiene `customRole` activo → usa sus `permissions` (reemplaza al rol base); luego se aplican overrides individuales (`UserPermission`).

## Diseño

### 1. Git — integración en `main` (local, sin push)

1. Borrar rama `local` (local + `origin/local`).
2. `git merge local-inventory` sobre `main`, resolviendo conflictos a favor de `local-inventory` (superset). Verificación: `git diff local-inventory main` debe quedar vacío tras el merge (antes de los pasos 2 y 3 de demo).
3. `git cherry-pick 5193507` (columna Propinas al final). Resolver si ya está aplicado.
4. Los cambios de demo (§2 y §3) se agregan como commits nuevos encima.
5. **No** hacer push a `origin`. `origin/main` permanece intacto hasta que el usuario decida desplegar.

### 2. Desactivar inventario en el UI (código dormido, reactivable)

- **Env:** no definir `NEXT_PUBLIC_INVENTARIO_APP_URL` en el entorno demo → enlaces ocultos y sync inerte (comportamiento ya existente).
- **Helper único:** `isInventoryEnabled()` = `Boolean(process.env.NEXT_PUBLIC_INVENTARIO_APP_URL)` en un módulo compartido (p. ej. `src/lib/inventory-config.ts`).
- **Ocultar residuales cuando está desactivado:**
  - `EmployeeForm.tsx`: no renderizar la sección "acceso a inventario".
  - `RoleForm.tsx` y `UserPermissionsForm.tsx`: filtrar el grupo `module === "inventory"` de `PERMISSION_GROUPS`.
- El código y las tablas del inventario quedan intactos. Reactivable definiendo la env — sin cambios de código.

### 3. BD demo (Turso) — corregir esquema + reset + seed

1. **Backup** (previo a cualquier borrado): exportar todas las tablas actuales a `scratchpad/turso-backup-<timestamp>.json` (dump por tabla vía `@libsql/client`). Confirmado por el usuario: reset con backup.
2. **Aplicar esquema:** `prisma db push` apuntando a la BD Turso (crea tablas/columnas faltantes; aditivo, no destructivo). Requiere `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` en el entorno del comando.
3. **Reset + seed integral:** adaptar `prisma/seed-local.ts` para:
   - Borrar todas las tablas (`deleteMany`) y crear 1 tenant **"Restaurante Demo"**.
   - Crear **5 usuarios** (credenciales memorizables, confirmadas):
     | Usuario | Contraseña | Rol |
     |---|---|---|
     | `SadminJavier` | `Javier123` | PROPRIETARY |
     | `SadminMajo` | `Majo123` | SUPERADMIN |
     | `AdminValen` | `Valen123` | ADMIN |
     | `CesarH` | `CesarH123` | EMPLOYEE |
     | `SupervisorDemo` | `Supervisor123` | EMPLOYEE (base) + CustomRole "Supervisor de turno" |
   - **Rol personalizado** "Supervisor de turno" (`slug: supervisor-turno`, `isSystem: false`, `active: true`) con permisos editados: `time_entries:view/create/edit`, `schedules:view`, `tips:view`, `payroll:view`. Asignado a `SupervisorDemo` vía `customRoleId`.
   - **Datos de prueba en todas las tablas** (periodo quincenal actual): empleados adicionales sin login (para nómina), registros de horas (con domingos especiales), horario publicado con turnos, bonos STANDARD + PER_EMPLOYEE con asignaciones, descuentos ALL + PER_EMPLOYEE con asignaciones, ajustes de pago (BONUS/DISCOUNT), propina con distribución proporcional, y un override individual `UserPermission` (`audit:view` a `AdminValen`).
   - `inventoryAccess = false` en todos los usuarios. **Sin** categorías de inventario.

### 4. Verificación

- `npm run build` (o `tsc`) para confirmar que la desactivación de inventario y el merge no rompen tipos.
- `npm run test` si aplica.
- Reconsultar la BD Turso: verificar tablas creadas, 5 usuarios con roles correctos, custom role asignado, y conteos de datos de prueba > 0 en cada tabla.
- Confirmar que `git diff local-inventory main` solo muestra los cambios de demo (§2/§3) + el cherry-pick.

## Entregables

- 5 usuarios + contraseñas (tabla de §3).
- Ubicación del backup de la BD previa.
- Resumen de cambios de esquema aplicados.
- `main` local con todo integrado, **sin push** (para revisión del usuario).

## Fuera de alcance

- Desplegar (push a `origin/main` / Vercel) — lo decide el usuario tras revisar.
- Eliminar código del inventario — se deja dormido, reactivable por env.
- Cambios en `deploy-fiori` / `local-inventory` — permanecen como están.

## Riesgos

- **Merge `local-inventory` → `main`:** posibles conflictos por las dos líneas de RBAC. Mitigación: resolver a favor de `local-inventory` (superset verificado) y validar con `git diff` vacío.
- **`prisma db push` sobre Turso:** solo cambios aditivos esperados; el backup previo permite restaurar. Verificar que no reporte drops destructivos antes de aceptar.
- **Reset de BD:** destruye datos reales de "Cucina dei Fiori"; mitigado por backup confirmado.
