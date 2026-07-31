# Restaurant Nómina Xpress

Sistema web de gestión de nómina para restaurantes, **desplegado de forma
independiente para cada cliente**: cada cliente tiene su propio despliegue y su
**propia base de datos** (un único restaurante por base). El
administrador registra las horas de los empleados y el sistema calcula salarios con
**tarifas diferenciadas para domingos y festivos colombianos**, gestiona propinas,
bonos y descuentos, y genera **reportes PDF/Excel** quincenales y mensuales.

## Índice de documentación

| Documento | Para quién | Contenido |
|---|---|---|
| **README.md** (este) | Todos | Resumen + arranque rápido. |
| [DOCUMENTACION_COMPLETA_DEL_PROYECTO.md](DOCUMENTACION_COMPLETA_DEL_PROYECTO.md) | Desarrolladores / mantenedores | Arquitectura, base de datos, módulos, reglas de negocio, seguridad, despliegue, mantenimiento. |
| [MANUAL_DE_USUARIO.md](MANUAL_DE_USUARIO.md) | Cliente final | Cómo usar cada funcionalidad, paso a paso, por rol. |
| [DESPLIEGUES.md](DESPLIEGUES.md) | DevOps | Código base único + despliegues por env vars, runbook de promoción, alta de clientes. |
| [BACKUP.md](BACKUP.md) | DevOps | Backups cifrados de Turso (GitHub Actions) y restauración. |
| [docs/INTEGRACION_INVENTARIO.md](docs/INTEGRACION_INVENTARIO.md) | Desarrolladores | Contrato de permisos con el módulo externo de inventario. |
| [CLAUDE.md](CLAUDE.md) | Desarrolladores / agentes IA | Reglas de arquitectura y convenciones del proyecto. |
| `docs/img/` | — | Capturas del manual. **Generadas** con `npm run docs:screenshots`; no editar a mano. |
| `docs/superpowers/` | Referencia histórica | Planes y specs de implementación (fechados). |

Los `.pdf` de ambos documentos se versionan como entregable para el cliente, pero el
**Markdown es la fuente de verdad**: tras editar un `.md`, regenera los PDF con
`npm run docs:pdf` antes de commitear (ver §23 del manual / §23 de la documentación
técnica).

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS v4 · shadcn/ui ·
Prisma 7 (adapter **libSQL**) · SQLite local / **Turso** en producción ·
NextAuth v5 (Credentials) · @react-pdf/renderer · exceljs · date-holidays · Vitest.

## Arranque rápido (local)

Requisitos: **Node.js 20+** y npm.

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
#   Para desarrollo local basta con:
#     TURSO_DATABASE_URL="file:./dev.db"
#     NEXTAUTH_SECRET="<32+ chars: openssl rand -base64 32>"
#     NEXTAUTH_URL="http://localhost:3000"

# 3. Crear la base de datos local y el cliente Prisma
npx prisma generate
npx prisma db push          # crea/actualiza el schema en ./dev.db

# 4. Sembrar datos de prueba (elige uno)
npx tsx prisma/seed-local.ts   # demo completa: 5 usuarios + datos en todas las tablas
#   o el seed mínimo:
npm run db:seed                # 1 admin + 2 empleados

# 5. Arrancar
npm run dev                    # http://localhost:3000
```

### Credenciales de prueba (seed local `prisma/seed-local.ts`)

> El inicio de sesión es **por nombre de usuario** (no por email).

| Usuario | Contraseña | Rol |
|---|---|---|
| `proprietario` | `proprietario123` | PROPRIETARY (acceso total) |
| `superadmin` | `superadmin123` | SUPERADMIN |
| `admin` | `admin123` | ADMIN |
| `empleado` | `empleado123` | EMPLEADO |
| `SupervisorDemo` | `Supervisor123` | EMPLEADO + rol personalizado "Supervisor de turno" |

El seed mínimo (`npm run db:seed`, `prisma/seed.ts`) crea en su lugar `admin`/`admin123`
(SUPERADMIN) y `maria`/`emp123` (EMPLEADO). Las credenciales del despliegue demo en la
nube pueden diferir de las de los seeds locales.

## Comandos

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo (localhost:3000). |
| `npm run build` | `prisma generate` + build de producción. |
| `npm run lint` | ESLint. |
| `npm run test` | Vitest (tests unitarios). |
| `npm run db:seed` | Seed mínimo (`prisma/seed.ts`). |
| `npx tsx prisma/seed-local.ts` | Seed integral de demostración. |
| `npx prisma db push` | Aplicar el schema a la BD (crea/actualiza tablas). |
| `npx prisma studio` | GUI de base de datos. |
| `npx prisma generate` | Regenerar el cliente Prisma (`src/generated/prisma`). |

## Despliegue

Todos los despliegues salen de un único código base (`main`) y se diferencian
**solo con Environment Variables en Vercel**. Ver [DESPLIEGUES.md](DESPLIEGUES.md)
para la topología, el runbook de promoción y el alta de clientes nuevos, y
[BACKUP.md](BACKUP.md) para los respaldos.
