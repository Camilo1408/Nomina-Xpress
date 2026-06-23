# Guía: Permisos de inventario diario POR CATEGORÍA (configuración en Nómina Xpress)

> **Para la sesión de Claude que trabaja en el proyecto de Nómina (`restaurant-nomina`).**
> El proyecto de **inventario** ya fue actualizado: el inventario diario ahora es
> **independiente por categoría** (Barra, Cocina, Limpieza y futuras) y hace *enforcing*
> de permisos granulares por categoría leídos del JWT. **No toques el proyecto de inventario.**
> Aquí solo se documenta lo que Nómina debe emitir/gestionar.

---

## 1. Contrato de permisos (lo que el inventario espera en el JWT)

El JWT que comparten ambas apps ya transporta `inventoryPermissions: string[]`. Para el
inventario diario por categoría, el inventario espera **5 claves por cada categoría raíz**,
basadas en el **slug** de la categoría:

```
inventory:daily:<slug>:view      → ver el inventario diario de esa categoría
inventory:daily:<slug>:open      → abrir/crear la jornada (registrar conteo inicial)
inventory:daily:<slug>:close     → cerrar la jornada (registrar conteo final)
inventory:daily:<slug>:edit      → reabrir/editar la jornada cerrada
inventory:daily:<slug>:history   → ver historial/reportes de esa categoría
```

Ejemplos reales (slugs ya existentes en el inventario): `barra`, `cocina`, `limpieza`.

```
inventory:daily:barra:view
inventory:daily:barra:open
inventory:daily:barra:close
inventory:daily:barra:edit
inventory:daily:barra:history
inventory:daily:cocina:view
inventory:daily:cocina:open
... etc.
```

> **Rol exacto:** usar siempre **`PROPRIETARY`** (nunca `PROPRIERTY`, `PROPIETARY`, etc.).

### Fuente de los slugs
El inventario es el dueño de las categorías. Expone la lista (con `slug`) en
`GET /api/categories` (devuelve `slug` por categoría). Nómina debe leer esa lista
—o consultar la misma base de datos compartida— para generar dinámicamente las claves.
**Las categorías raíz** (`parentId = null`) son las únicas con permisos de inventario.

---

## 2. Creación dinámica de permisos al crear una categoría

Cuando se crea una nueva categoría **raíz** de inventario, Nómina debe registrar
automáticamente sus 5 claves. Pseudocódigo del servicio:

```ts
function dailyCategoryKeys(slug: string): string[] {
  return ["view", "open", "close", "edit", "history"].map(a => `inventory:daily:${slug}:${a}`);
}

async function onInventoryCategoryCreated(slug: string, name: string) {
  const keys = dailyCategoryKeys(slug);
  // 1. Registrar las claves como permisos disponibles (tabla Permission / catálogo).
  await ensurePermissionsExist(keys);
  // 2. Asignar por defecto a los roles base (ver sección 3).
  await grantToRole("PROPRIETARY", keys, { locked: true });   // protegido, no removible
  await grantToRole("SUPERADMIN", keys, { locked: false });
  await grantToRole("ADMIN", keys, { locked: false });
}
```

**Disparador recomendado:** un *hook*/endpoint que Nómina invoque cuando el inventario
crea una categoría, **o** una sincronización periódica que lea `GET /api/categories` del
inventario y haga *upsert* de las claves faltantes. El inventario ya deja constancia del
evento `category.permissions.autocreate` en su auditoría con la lista exacta de claves.

---

## 3. Permisos por defecto

| Rol | Acceso por defecto a una categoría nueva | ¿PROPRIETARY puede desactivarlo? |
|---|---|---|
| **PROPRIETARY** | Las 5 claves, **protegido** (no removible) | — (siempre protegido) |
| **SUPERADMIN** | Las 5 claves | Sí |
| **ADMIN** | Las 5 claves | Sí |
| EMPLEADO / rol personalizado | Ninguna (se asignan a mano) | Sí |

- **PROPRIETARY** siempre conserva acceso completo a todas las categorías. Marca sus
  asignaciones como `locked = true` y bloquea en backend cualquier intento de removerlas.
- **SUPERADMIN/ADMIN** reciben todo por defecto, pero **PROPRIETARY puede activar/desactivar**
  cada clave (por categoría) para ellos, para roles personalizados o para usuarios concretos.

---

## 4. Cómo PROPRIETARY activa/desactiva permisos

UI sugerida en Nómina (pantalla "Permisos de inventario"):

- Una matriz **categoría × acción** (`view/open/close/edit/history`) por **rol** y por **usuario**.
- Solo **PROPRIETARY** puede editar esta matriz.
- Las celdas de PROPRIETARY se muestran activas y deshabilitadas (no editables).
- Guardar persiste en la tabla de asignaciones (ver sección 5) y se refleja en el próximo login
  (el JWT se firma al iniciar sesión → **se requiere re-login** para aplicar cambios).

Validación de backend obligatoria: rechazar (403) cualquier intento de un rol distinto de
PROPRIETARY de modificar estos permisos, y cualquier intento de quitar permisos a PROPRIETARY.

---

## 5. Modelos / migraciones / seeds / servicios / endpoints / UI en Nómina

**Modelos / migraciones**
- `Permission` (catálogo de claves) — o un enum dinámico; clave string única.
- `RolePermission(roleId, permissionKey, locked)` — asignación por rol.
- `UserPermission(userId, permissionKey, granted)` — *overrides* por usuario (opcional).
- Migración para poblar las claves de las categorías existentes (`barra`, `cocina`, `limpieza`).

**Seeds**
- Sembrar las 5 claves por cada categoría raíz existente y asignarlas a PROPRIETARY (locked),
  SUPERADMIN y ADMIN.

**Servicios**
- `dailyCategoryKeys(slug)`, `onInventoryCategoryCreated()`, `syncInventoryCategories()`
  (lee `GET /api/categories` del inventario y hace upsert de claves faltantes).
- Builder del JWT: incluir en `inventoryPermissions` todas las claves efectivas del usuario
  (unión de las de su rol + overrides), **resolviendo los locks de PROPRIETARY**.

**Endpoints**
- `GET /inventory-permissions` (matriz actual), `PUT /inventory-permissions` (solo PROPRIETARY).
- Webhook/endpoint opcional para recibir el aviso de "categoría creada" desde el inventario.

**UI**
- Pantalla de matriz de permisos de inventario (sección 4).
- Al crear/gestionar usuarios y roles, exponer las claves por categoría.

---

## 6. Pruebas recomendadas

1. Crear una categoría nueva en el inventario → verificar que Nómina registra sus 5 claves y
   que PROPRIETARY/SUPERADMIN/ADMIN las reciben por defecto.
2. Un usuario con `inventory:daily:cocina:*` pero **sin** `inventory:daily:barra:*`:
   - Ve y opera Cocina; **no** ve Barra; el acceso directo por URL a Barra responde 403/redirect.
3. PROPRIETARY desactiva `inventory:daily:barra:close` para ADMIN → tras re-login, ese ADMIN
   puede abrir Barra pero **no** cerrarla (el botón desaparece y el backend responde 403).
4. Intentar quitar permisos a PROPRIETARY → rechazado (locked).
5. Cocina y Barra son independientes: cerrar Cocina no exige ni bloquea Barra.
6. Re-login refleja los cambios de permisos.

---

## 7. Notas de integración con el proyecto de inventario (ya implementado, solo contexto)

- El inventario hace *enforcing* por clave en **todas** las rutas (`view/open/close/edit/history`),
  devolviendo **403** ante acceso no autorizado (no depende de ocultar botones).
- En **modo standalone** (sin Nómina), el inventario concede por rol: PROPRIETARY/SUPERADMIN/ADMIN
  tienen todas las categorías automáticamente (sin re-login al crear categorías). El esquema de
  *toggle* granular vive aquí, en Nómina, para el **modo integrado**.
- Fallback transicional: mientras Nómina aún no emita las claves por categoría, el inventario
  acepta la clave global vieja `inventory:stock:count` para operar (no para `history`). Una vez
  Nómina emita las claves por categoría, este fallback deja de ser necesario.
- El inventario registra auditoría local (abrir/cerrar/reabrir/editar por categoría, crear
  categoría, auto-registrar permisos, accesos denegados), con retención de 6 meses.
