# Sincronización de permisos de categorías de inventario con Nómina Xpress

> **Qué cambió en el inventario (ya hecho aquí):** ahora el inventario expone y
> notifica las claves de permiso por categoría. **Falta el lado de Nómina** —este
> documento dice exactamente qué implementar allí.

## Contexto

- Nómina sigue siendo la **fuente de verdad** de los permisos: emite `inventoryPermissions`
  en el JWT (ver `GUIA_PERMISOS_GRANULARES.md`).
- El inventario diario se controla por **categoría raíz**. Cada categoría raíz tiene
  5 claves de permiso derivadas de su `slug`:

  ```
  inventory:daily:<slug>:view
  inventory:daily:<slug>:open
  inventory:daily:<slug>:close
  inventory:daily:<slug>:edit
  inventory:daily:<slug>:history
  ```

- **Solo las categorías RAÍZ tienen claves.** Las subcategorías heredan: el permiso
  de la raíz (p. ej. `barra`) cubre todas sus subcategorías (Licores, Cócteles, etc.).
- Las 10 claves globales del módulo no cambian (`inventory:view`, `inventory:products:*`, etc.).

## Lo que el inventario ya ofrece (dos vías)

### 1. Pull — endpoint de registro (recomendado para reconciliar)

```
GET /api/inventory-permissions      (requiere sesión de rol administrativo)
```

Respuesta:

```json
{
  "global": ["inventory:view", "inventory:products:create", "... (10)"],
  "categories": [
    { "slug": "barra",  "name": "Barra",  "keys": ["inventory:daily:barra:view", "...:open", "...:close", "...:edit", "...:history"] },
    { "slug": "cocina", "name": "Cocina", "keys": ["inventory:daily:cocina:view", "...(5)"] }
  ],
  "defaultGrantRoles": ["PROPRIETARY", "SUPERADMIN", "ADMIN"]
}
```

### 2. Push — webhook al crear una categoría raíz (opcional, best-effort)

Si configuras en el inventario la env `NOMINA_PERMISSION_SYNC_URL` (y opcional
`NOMINA_SYNC_SECRET`), al crear una categoría raíz el inventario hace:

```
POST <NOMINA_PERMISSION_SYNC_URL>
x-sync-secret: <NOMINA_SYNC_SECRET>   (si se configuró)

{
  "event": "inventory.category.created",
  "category": { "slug": "bodega", "name": "Bodega" },
  "keys": ["inventory:daily:bodega:view", "...:open", "...:close", "...:edit", "...:history"],
  "assignToRoles": ["PROPRIETARY", "SUPERADMIN", "ADMIN"]
}
```

Es best-effort: si Nómina no responde, **no** falla la creación de la categoría; la
reconciliación por `GET /api/inventory-permissions` cubre el hueco.

## Qué implementar en Nómina

### A) Registrar/actualizar el catálogo de permisos

1. **Reconciliación (pull):** un job o acción que llame
   `GET <INVENTARIO_URL>/api/inventory-permissions` y haga *upsert* de todas las
   claves (`global` + `categories[].keys`) en el catálogo de permisos de Nómina.
   - Ejecutarlo: al abrir la pantalla de roles, en un cron, o con un botón "Sincronizar".
2. **Webhook (push) [opcional]:** expón un endpoint que reciba el `POST` de arriba,
   valide `x-sync-secret`, y haga *upsert* de `keys`.

### B) Asignar automáticamente a los roles existentes

Al registrar claves **nuevas de categoría** (`inventory:daily:<slug>:*`):

- Asignarlas automáticamente a los roles de `assignToRoles`
  (**PROPRIETARY, SUPERADMIN, ADMIN**) — así estos roles obtienen acceso total a la
  nueva categoría sin intervención manual.
- Para EMPLOYEE / roles personalizados: **no** asignar por defecto; que el admin las
  marque en la UI de roles (igual que el resto de permisos granulares).
- Hazlo idempotente: si la clave ya estaba asignada, no duplicar.

### C) UI de roles

- Mostrar las claves por categoría agrupadas por `category.name`, con las 5 acciones
  (ver / abrir / cerrar / editar / historial) como checkboxes.
- Tras asignar, el usuario debe **re-loguear** para que el JWT incluya las claves nuevas.

## Notas

- **Solo raíz:** no generes claves por subcategoría. El gate del inventario ya resuelve
  el acceso a subcategorías a partir del permiso de su raíz.
- **Slug estable:** el `slug` es la clave del contrato; no cambia aunque se renombre la
  categoría (se genera una sola vez al crear).
- **Standalone:** en modo `standalone` el inventario ya concede acceso total por rol a
  PROPRIETARY/SUPERADMIN/ADMIN sin necesidad de este sync (solo aplica al modo integrado
  con Nómina).
