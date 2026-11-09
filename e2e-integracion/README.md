# Pruebas de integración Nómina ↔ Inventory

Levantan las **dos aplicaciones reales** en modo integrado (Nómina en el puerto 3100 e
Inventory en el 3101) y recorren en un navegador lo que antes solo se probaba a mano:

- Entrar al inventario sin sesión lleva al inicio de sesión de Nómina y vuelve al inventario.
- Con la sesión de Nómina, el inventario abre sin pedir la clave otra vez.
- Los permisos llegan de Nómina: un empleado sin acceso no entra; un ADMIN gestiona productos.
- Desactivar a un usuario en Nómina lo saca del inventario en un minuto como máximo (I-H1b).
- La cookie de sesión no sirve como token del canal de verificación.

Cada aplicación usa una SQLite efímera propia y un `NEXTAUTH_SECRET` de relleno, el mismo en
las dos (`env.mjs`). No se toca ninguna base real ni se usa ningún secreto.

## Cómo correrlas en local

Hace falta el código de Inventory en la carpeta hermana `../inventario-restaurante` (u otra,
con `INVENTORY_DIR`) y sus dependencias instaladas. Las dos aplicaciones se compilan con las
variables de `env.mjs`, porque varias son `NEXT_PUBLIC_*` y quedan fijas al compilar.

```bash
# 1. Build de Nómina
env $(node e2e-integracion/env.mjs nomina | xargs) TURSO_AUTH_TOKEN= npm run build

# 2. Build de Inventory
(cd ../inventario-restaurante && env $(node ../restaurant-nomina/e2e-integracion/env.mjs inventory | xargs) TURSO_AUTH_TOKEN= pnpm build)

# 3. Pruebas
npm run test:e2e:integracion
```

`TURSO_AUTH_TOKEN=` vacío evita que el build cargue el token de un `.env.production` local.

Después de estas pruebas, el build de Nómina queda con el enlace al inventario apuntando a
`localhost:3101`. Vuelve a correr `npm run build` antes de `npm run test:e2e`.

## En el CI

El job **Integración con Inventory** de `.github/workflows/ci.yml` hace lo mismo con la rama
`main` de Inventory Xpress. Si falla sin que este repositorio haya cambiado, el cambio que
rompió el contrato está en Inventory.
