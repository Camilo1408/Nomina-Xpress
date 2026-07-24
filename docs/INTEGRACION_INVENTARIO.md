# Integración con el módulo de Inventario

> **Estado (2026-07):** el módulo de inventario es una app **externa** (otra base
> de datos / otro despliegue). En el código base único de `main` la integración
> está **desactivada por defecto** mediante el feature flag
> `NEXT_PUBLIC_INVENTARIO_APP_URL` (ver [`DESPLIEGUES.md`](../DESPLIEGUES.md) y
> `src/lib/feature-flags.ts`). Este documento describe el **contrato de permisos**
> entre Nómina Xpress (fuente de verdad de permisos) y el Inventario, y qué está
> implementado vs. pendiente.
>
> Este archivo consolida los antiguos `GUIA_PERMISOS_INVENTARIO_POR_CATEGORIA.md`
> y `NOMINA-SYNC-PERMISOS-CATEGORIAS.md` (fusionados aquí sin pérdida de contenido).

---

## 1. Arquitectura de la integración

- **Nómina Xpress = fuente de verdad de permisos.** Emite el arreglo
  `inventoryPermissions: string[]` dentro del **JWT de NextAuth** al iniciar sesión.
  El Inventario lo lee y hace *enforcing* granular en todas sus rutas (responde
  **403** ante acceso no autorizado; no depende de ocultar botones).
- **El Inventario es dueño de las categorías.** Expone la lista (con `slug`) en
  `GET /api/categories`. Nómina mantiene un **espejo local** de las categorías raíz
  en el modelo `InventoryCategory` (`src/lib/inventory-sync.ts`), usado para (a)
  generar las claves de permiso por categoría en la matriz de roles/usuarios y (b)
  emitirlas en el JWT cuando no se puede llamar al Inventario en vivo.
- **El flag de activación** es la env `NEXT_PUBLIC_INVENTARIO_APP_URL`: si está
  definida (URL no vacía), el UI de inventario (enlaces en sidebar/portal, sync,
  controles de permisos) se activa; si no, queda oculto con el código intacto.

## 2. Contrato de permisos

### 2.1 Claves globales del módulo (10, estáticas)

Definidas en `src/lib/permission-keys.ts` (constante `PERMISSIONS`, prefijo `inventory:`):

```
inventory:view                 → acceder al inventario
inventory:products:create      → crear productos
inventory:products:edit        → editar productos
inventory:products:delete      → eliminar/desactivar productos
inventory:categories:manage    → crear/editar categorías
inventory:stock:count          → registrar movimientos / inventario diario
inventory:stock:adjust         → ajustes manuales de stock
inventory:daily:reopen         → reabrir inventario diario cerrado
inventory:reports:view         → ver reportes de inventario
inventory:users:manage         → gestionar usuarios del inventario (modo standalone)
```

### 2.2 Claves dinámicas por categoría (5 por categoría raíz)

El inventario diario es **independiente por categoría raíz** (Barra, Cocina,
Limpieza, …). Por cada categoría raíz, identificada por su **`slug`**, existen 5
claves derivadas (validadas por patrón, no estáticas):

```
inventory:daily:<slug>:view      → ver el inventario diario de esa categoría
inventory:daily:<slug>:open      → abrir/crear la jornada (conteo inicial)
inventory:daily:<slug>:close     → cerrar la jornada (conteo final)
inventory:daily:<slug>:edit      → reabrir/editar la jornada cerrada
inventory:daily:<slug>:history   → ver historial/reportes de esa categoría
```

Ejemplos con slugs existentes: `inventory:daily:barra:view`,
`inventory:daily:cocina:close`, `inventory:daily:limpieza:history`.

- **Solo las categorías RAÍZ** (`parentId = null`) tienen claves. Las subcategorías
  (Licores, Cócteles, …) **heredan** el permiso de su raíz.
- **`slug` estable:** es la clave del contrato; se genera una sola vez al crear la
  categoría y **no cambia** aunque se renombre.
- **Rol exacto:** usar siempre **`PROPRIETARY`** (nunca `PROPRIERTY`, `PROPIETARY`, etc.).

Helpers en `src/lib/permission-keys.ts`: `dailyCategoryKeys(slug)`,
`dailyCategoryKey(slug, action)`, `isDailyCategoryKey(key)`,
`parseDailyCategoryKey(key)`, `permissionLabel(key, nameBySlug)`.

## 3. Permisos por defecto por rol

| Rol | Acceso por defecto a una categoría nueva | ¿PROPRIETARY puede desactivarlo? |
|---|---|---|
| **PROPRIETARY** | Las 5 claves, **protegido** (no removible) | — (siempre protegido) |
| **SUPERADMIN** | Las 5 claves | Sí |
| **ADMIN** | Las 5 claves | Sí |
| EMPLEADO / rol personalizado | Ninguna (se asignan a mano) | Sí |

- **PROPRIETARY** siempre conserva acceso completo a todas las categorías.
- **SUPERADMIN/ADMIN** reciben todo por defecto, pero **PROPRIETARY** puede
  activar/desactivar cada clave (por categoría) para ellos, para roles personalizados
  o para usuarios concretos.
- En `auth.ts`, los roles privilegiados **con rol base** (sin CustomRole activo)
  reciben en el JWT las claves de **todas las categorías activas** del espejo local.

## 4. Sincronización de categorías → claves (dos vías)

El Inventario ofrece dos mecanismos para que Nómina conozca las categorías y sus claves:

### 4.1 Pull — endpoint de registro (recomendado para reconciliar)

```
GET <INVENTARIO_URL>/api/inventory-permissions    (requiere sesión administrativa)
```

Respuesta:

```json
{
  "global": ["inventory:view", "inventory:products:create", "… (10)"],
  "categories": [
    { "slug": "barra",  "name": "Barra",  "keys": ["inventory:daily:barra:view", "…:open", "…:close", "…:edit", "…:history"] },
    { "slug": "cocina", "name": "Cocina", "keys": ["inventory:daily:cocina:view", "…(5)"] }
  ],
  "defaultGrantRoles": ["PROPRIETARY", "SUPERADMIN", "ADMIN"]
}
```

Ejecutar: al abrir la pantalla de roles, en un cron, o con un botón "Sincronizar".
Hace *upsert* de todas las claves (`global` + `categories[].keys`) en el catálogo
de permisos de Nómina.

### 4.2 Push — webhook al crear una categoría raíz (opcional, best-effort)

Si en el Inventario se configura `NOMINA_PERMISSION_SYNC_URL` (y opcional
`NOMINA_SYNC_SECRET`), al crear una categoría raíz el Inventario hace:

```
POST <NOMINA_PERMISSION_SYNC_URL>
x-sync-secret: <NOMINA_SYNC_SECRET>   (si se configuró)

{
  "event": "inventory.category.created",
  "category": { "slug": "bodega", "name": "Bodega" },
  "keys": ["inventory:daily:bodega:view", "…:open", "…:close", "…:edit", "…:history"],
  "assignToRoles": ["PROPRIETARY", "SUPERADMIN", "ADMIN"]
}
```

Es **best-effort**: si Nómina no responde, la creación de la categoría **no falla**;
la reconciliación por pull (4.1) cubre el hueco.

> En Nómina, la ruta que recibe/gestiona esta sincronización es
> `src/app/api/inventory-permissions/sync/route.ts` (excluida del proxy de auth en
> `src/proxy.ts`).

## 5. Aplicación de cambios de permisos

- Al asignar claves **nuevas de categoría**, asignarlas automáticamente a los roles
  de `assignToRoles` (**PROPRIETARY, SUPERADMIN, ADMIN**); para EMPLEADO / roles
  personalizados **no** asignar por defecto (el admin las marca en la UI). Hazlo
  **idempotente** (no duplicar si ya estaba asignada).
- El JWT se firma **al iniciar sesión** → cualquier cambio de permisos requiere
  **re-login** para aplicarse.
- Validación de backend obligatoria: rechazar (**403**) cualquier intento de un rol
  distinto de PROPRIETARY de modificar estos permisos, y cualquier intento de quitar
  permisos a PROPRIETARY (claves `locked`).

## 6. Estado de implementación en Nómina

| Pieza | Estado |
|---|---|
| Claves estáticas + dinámicas y helpers (`permission-keys.ts`) | ✅ Implementado |
| Modelo espejo `InventoryCategory` | ✅ Implementado (schema) |
| Sync/espejo de categorías (`inventory-sync.ts`) | ✅ Implementado (tolerante a inventario ausente) |
| Emisión de `inventoryPermissions` en el JWT (`auth.ts`) | ✅ Implementado |
| Ruta `/api/inventory-permissions/sync` | ✅ Implementado |
| Toggle de acceso a inventario por empleado (`EmployeeForm`) | ✅ Implementado (oculto si flag OFF) |
| Grupo "Inventario" en matriz de roles/usuarios | ✅ Implementado (oculto si flag OFF) |
| Pantalla dedicada "matriz categoría × acción" para PROPRIETARY | ⏳ Pendiente / a validar |
| Activación en producción | 🔕 **Desactivada por flag** en demo/main; ON solo donde se defina la env |

## 7. Notas del lado del Inventario (contexto, ya implementado allí)

- El Inventario hace *enforcing* por clave en **todas** las rutas
  (`view/open/close/edit/history`), devolviendo **403** ante acceso no autorizado.
- En **modo standalone** (sin Nómina) concede por rol: PROPRIETARY/SUPERADMIN/ADMIN
  obtienen todas las categorías automáticamente. El *toggle* granular vive en Nómina,
  para el **modo integrado**.
- **Fallback transicional:** mientras Nómina no emita las claves por categoría, el
  Inventario acepta la clave global vieja `inventory:stock:count` para operar (no
  para `history`).
- El Inventario registra su propia auditoría (abrir/cerrar/reabrir/editar por
  categoría, crear categoría, auto-registrar permisos, accesos denegados), retención
  6 meses.

## 8. Pruebas recomendadas (modo integrado)

1. Crear una categoría nueva en el Inventario → Nómina registra sus 5 claves y
   PROPRIETARY/SUPERADMIN/ADMIN las reciben por defecto.
2. Usuario con `inventory:daily:cocina:*` pero **sin** `inventory:daily:barra:*`:
   ve y opera Cocina; **no** ve Barra; el acceso directo por URL a Barra → 403/redirect.
3. PROPRIETARY desactiva `inventory:daily:barra:close` para ADMIN → tras re-login,
   ese ADMIN abre Barra pero **no** la cierra (botón oculto y backend 403).
4. Intentar quitar permisos a PROPRIETARY → rechazado (locked).
5. Cocina y Barra son independientes: cerrar Cocina no exige ni bloquea Barra.
6. Re-login refleja los cambios de permisos.
