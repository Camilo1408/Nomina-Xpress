# SPEC — Fix enforcing de permisos por categoría en Inventory Xpress

> **Repo objetivo:** Inventory Xpress (app externa, NO este repo de Nómina).
> **Contexto:** ver [`docs/INTEGRACION_INVENTARIO.md`](INTEGRACION_INVENTARIO.md) en Nómina.
> **Lado Nómina:** ya correcto, no requiere cambios. Este spec es 100% para el app de Inventario.

## Problema

Un usuario con permisos de inventario diario **solo para algunas categorías**
(ej. `chefadriana`: tiene `inventory:daily:cocina:*` pero **NO** `inventory:daily:barra:*`)
**sí ve y opera Barra** en la pantalla "Inventario Diario".

## Causa raíz

El app de Inventario tiene un **fallback transicional** (documentado en
`INTEGRACION_INVENTARIO.md §7`): cuando ve la clave global `inventory:stock:count`
en el JWT, concede operación sobre **TODAS** las categorías, ignorando las claves
por categoría `inventory:daily:<slug>:view`.

Agravante: Nómina **siempre** incluye `inventory:stock:count` en el JWT de cualquier
empleado con el toggle "Acceso a Inventario" activo (ver `auth.ts` →
`resolveInventoryPermissions`, líneas ~31-34). Por eso el fallback se dispara siempre
y **el fix debe hacerse del lado de Inventario** — no hay mitigación robusta en Nómina.

## Contrato de entrada (lo que Nómina emite, ya correcto)

El JWT de NextAuth (mismo `NEXTAUTH_SECRET`, cookie compartida entre subdominios)
trae `inventoryPermissions: string[]`. Dos tipos de clave:

- **Globales** (10, estáticas): `inventory:view`, `inventory:stock:count`,
  `inventory:products:*`, `inventory:categories:manage`, `inventory:stock:adjust`,
  `inventory:daily:reopen`, `inventory:reports:view`, `inventory:users:manage`,
  `inventory:audit:view`.
- **Dinámicas por categoría raíz** (5 por `slug`):
  `inventory:daily:<slug>:view | open | close | edit | history`.

Regex de las dinámicas: `^inventory:daily:([a-z0-9-]+):(view|open|close|edit|history)$`

Para `chefadriana`, `inventoryPermissions` contiene `inventory:daily:cocina:*`,
`inventory:view`, `inventory:stock:count` — y **ninguna** clave `barra`.

---

## Cambios a implementar

### Cambio 1 — (CRÍTICO) Eliminar el fallback de `inventory:stock:count`

Buscar en el código de Inventario dónde se acepta `inventory:stock:count` como
permiso de operación del inventario diario por categoría, y **eliminarlo** de esa
decisión. `inventory:stock:count` debe habilitar solo la pantalla genérica de
**Movimientos**, nunca conceder categorías del inventario diario.

```diff
- if (perms.includes("inventory:stock:count")) return true; // operaba TODAS las categorías
+ return canDaily(access, slug, action);                     // por categoría, siempre
```

### Cambio 2 — Helper de parseo del JWT

```ts
// lib/inventory-permissions.ts
type DailyAction = "view" | "open" | "close" | "edit" | "history";

interface InventoryAccess {
  globals: Set<string>;                   // inventory:view, inventory:stock:count, ...
  daily: Map<string, Set<DailyAction>>;   // slug -> {view, open, ...}
}

const DAILY_RE = /^inventory:daily:([a-z0-9-]+):(view|open|close|edit|history)$/;

export function parseInventoryAccess(keys: string[]): InventoryAccess {
  const globals = new Set<string>();
  const daily = new Map<string, Set<DailyAction>>();
  for (const k of keys) {
    const m = k.match(DAILY_RE);
    if (m) {
      const [, slug, action] = m;
      if (!daily.has(slug)) daily.set(slug, new Set());
      daily.get(slug)!.add(action as DailyAction);
    } else if (k.startsWith("inventory:")) {
      globals.add(k);
    }
  }
  return { globals, daily };
}

// UNICA función que decide acceso categoría/acción — SIN fallback a stock:count
export function canDaily(access: InventoryAccess, slug: string, action: DailyAction): boolean {
  return access.daily.get(slug)?.has(action) ?? false;
}
```

### Cambio 3 — Filtrar la lista de "Inventario Diario"

La pantalla que muestra las tarjetas (Barra / Cocina) debe listar solo las
categorías donde el usuario tiene `:view`:

```ts
const visibleCategories = allRootCategories.filter(
  (c) => canDaily(access, c.slug, "view")
);
```

Resultado esperado: `chefadriana` ve **solo Cocina**; Barra desaparece de la lista.

### Cambio 4 — Enforcing por ruta (403), no solo ocultar UI

Cada endpoint/página valida la acción específica y responde **403** si falta.
Ocultar la tarjeta no basta: hay que bloquear acceso directo por URL.

| Ruta (por `slug`)                    | Clave requerida                  |
|--------------------------------------|----------------------------------|
| `GET  /daily/<slug>`      (ver)      | `inventory:daily:<slug>:view`    |
| `POST /daily/<slug>/open` (abrir)    | `inventory:daily:<slug>:open`    |
| `POST /daily/<slug>/close`(cerrar)   | `inventory:daily:<slug>:close`   |
| `POST /daily/<slug>/reopen` (editar) | `inventory:daily:<slug>:edit`    |
| `GET  /daily/<slug>/history`         | `inventory:daily:<slug>:history` |

```ts
function requireDaily(access: InventoryAccess, slug: string, action: DailyAction) {
  if (!canDaily(access, slug, action)) {
    throw new Response("Forbidden", { status: 403 });
  }
}
```

Además, los botones **Abrir / Cerrar / Reabrir / Historial** dentro de una
categoría deben renderizarse según `canDaily(access, slug, action)`.

### Cambio 5 — No romper el modo standalone

Solo cuando **no** hay JWT integrado de Nómina (modo standalone), mantener la
concesión por rol (PROPRIETARY / SUPERADMIN / ADMIN → todas las categorías).
Cuando llega `inventoryPermissions` desde Nómina, la fuente de verdad es
**siempre** el arreglo por categoría — nunca el rol ni el fallback.

```ts
const access = jwt?.inventoryPermissions
  ? parseInventoryAccess(jwt.inventoryPermissions)  // modo integrado
  : accessFromRole(user.role);                       // standalone
```

---

## Verificación (caso de prueba §8.2 de INTEGRACION_INVENTARIO.md)

Con `chefadriana` (tiene `inventory:daily:cocina:*`, no `barra`):

1. Login → "Inventario Diario" muestra **solo Cocina**, no Barra.
2. `GET /daily/barra` directo por URL → **403 / redirect**.
3. En Cocina: puede ver/abrir/cerrar según sus claves; en Barra: nada.
4. PROPRIETARY / SUPERADMIN / ADMIN siguen viendo todas las categorías
   (rol base → todas las categorías en el JWT que emite Nómina).
5. Regresión: un usuario con `inventory:stock:count` pero sin ninguna clave
   `inventory:daily:*` **no** ve ninguna categoría del inventario diario
   (antes las veía todas).

## Notas

- El JWT se recalcula en cada request del lado de Nómina, así que los cambios de
  permisos se reflejan al refrescar (no requieren re-login del usuario).
- No modificar nada del lado de Nómina para este fix: ya emite las claves correctas.
