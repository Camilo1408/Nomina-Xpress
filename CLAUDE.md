# Restaurant Nómina Xpress

Sistema web de gestión de nómina para restaurantes. **Cada cliente se despliega de forma independiente, con su propia base de datos** (un único restaurante por base — NO es un SaaS multi-tenant compartido). Admin registra horas de empleados, el sistema calcula salarios con tarifas diferenciadas para domingos/festivos colombianos, genera reportes PDF/Excel quincenales y mensuales.

## Comandos

- `npm run dev` — Servidor de desarrollo en localhost:3000
- `npm run build` — Build de producción
- `npm run lint` — ESLint
- `npm run test` — Vitest (unit tests)
- `npx prisma db push` — Aplicar el schema a la BD (crea/actualiza tablas)
- `npx prisma generate` — Regenerar cliente Prisma
- `npx prisma studio` — GUI de base de datos
- `npm run db:seed` (o `npx tsx prisma/seed.ts`) — Seed mínimo: tenant + admin + 2 empleados
- `npx tsx prisma/seed-local.ts` — Seed integral: 5 usuarios (4 roles base + 1 rol personalizado) + datos en todas las tablas

## Credenciales demo

El login es **por nombre de usuario** (no por email). Seed integral (`prisma/seed-local.ts`):

- `proprietario` / `proprietario123` → PROPRIETARY
- `superadmin` / `superadmin123` → SUPERADMIN
- `admin` / `admin123` → ADMIN
- `empleado` / `empleado123` → EMPLOYEE
- `SupervisorDemo` / `Supervisor123` → EMPLOYEE + rol personalizado

Seed mínimo (`prisma/seed.ts`): `admin`/`admin123` (SUPERADMIN) y `maria`/`emp123` (EMPLOYEE).

## Tech Stack

Next.js 16 App Router + TypeScript + Tailwind CSS v4 + shadcn/ui + SQLite local / Turso (libSQL) en prod + Prisma 7 ORM + NextAuth v5 (Credentials) + @react-pdf/renderer + exceljs + date-holidays

## Architecture

### Prisma 7 — IMPORTANTE

Prisma 7 usa un nuevo motor "client" que requiere un adapter. Aquí usamos **`@prisma/adapter-libsql`** (`@libsql/client`) para local y producción por igual: en local `TURSO_DATABASE_URL` apunta a `file:./dev.db`; en producción a la URL `libsql://…` de Turso.
El cliente se inicializa en `src/lib/db.ts` pasando el adapter. El `schema.prisma` NO tiene `url` en el datasource — va en `prisma.config.ts` (lee `TURSO_DATABASE_URL`).

El cliente generado está en `src/generated/prisma/` (custom output).

El cliente generado está en `src/generated/prisma/` (custom output).

### Rutas de archivo (Next.js 16)

- `middleware.ts` → ahora es `proxy.ts` (renombrado en Next.js 16)
- La función exported es default (compatible con NextAuth `auth()` wrapper)

### Roles

Cuatro roles base: `PROPRIETARY` (acceso total), `SUPERADMIN`, `ADMIN`, `EMPLOYEE`.
Además: **roles personalizados** (`CustomRole`, permisos en JSON) y **overrides por
usuario** (`UserPermission`). Los permisos efectivos se resuelven en
`src/lib/get-permissions.ts`. El acceso al área admin depende de los permisos
efectivos, no del rol base.

### Directory Structure

- `src/app/(auth)/` — Rutas de autenticación (login) — único route group
- `src/app/admin/` — Portal de administración (dashboard, personal, horas, horarios, propinas, reportes, roles, usuarios, auditoría, configuración). Acceso por permisos efectivos.
- `src/app/portal/` — Portal de empleado (mi quincena, mi horario, perfil). Rol EMPLOYEE.
- `src/app/api/` — API routes (`admin/*`, `employee/*`, `auth/*`, `cron/*`, `inventory-permissions/*`)
- `src/components/ui/` — shadcn/ui primitives
- `src/components/admin/` — Componentes específicos del admin
- `src/components/portal/` — Componentes del portal empleado
- `src/components/shared/` — Componentes compartidos (AdminSidebar, PortalNav)
- `src/lib/` — Utilidades core: auth.ts, db.ts, holidays.ts, payroll.ts, color-contrast.ts, utils.ts
- `src/lib/pdf/` — Plantilla PDF de nómina
- `src/lib/excel/` — Plantilla Excel de nómina
- `src/types/` — Tipos TypeScript compartidos

### Data Flow

- Server Components leen de base de datos directamente vía `prisma` client
- Mutaciones van por API routes (POST/PUT/DELETE) llamadas desde componentes cliente
- NUNCA hacer fetch desde Server Component a una API route propia — usar Prisma directamente
- Todas las queries incluyen `where: { tenantId: session.user.tenantId }` — aislamiento de datos por `tenantId` (aunque cada BD tenga un solo cliente)

### Key Patterns

- Aislamiento por `tenantId`: TODOS los modelos lo tienen y TODA query filtra por él desde session. **No es un SaaS multi-tenant compartido** — cada cliente se despliega aparte con su **propia base de datos** (un único tenant por BD); el `tenantId` es aislamiento de datos heredado del diseño.
- `isSpecial` en TimeEntry se calcula en el servidor al crear/editar (nunca en cliente)
- Auto-contraste: usar `getContrastText(hex)` de `@/lib/color-contrast` para texto sobre fondos custom.

## Design System

### Colores (Light Mode)
- `--background`: #FAF7F2
- `--primary`: #C1643F (override por tenant)
- `--secondary`: #8B6355 (override por tenant)
- `--border`: #E0D5CA
- `--muted`: #F2EDE6
- Text primario: #2C1F15 / Text muted: #7A6358

### Typography
- Headings: Plus Jakarta Sans, 600-700
- Body/UI: Inter, 400-500
- Números/tablas: JetBrains Mono, 400

## Environment Variables

Plantilla completa en `.env.example`. Matriz por cliente en [DESPLIEGUES.md](DESPLIEGUES.md).

### Local — `.env.local`
| Variable | Descripción |
|----------|-------------|
| `TURSO_DATABASE_URL` | En local apunta a `file:./dev.db` |
| `NEXTAUTH_SECRET` | Secreto JWT (32+ chars) |
| `NEXTAUTH_URL` | `http://localhost:3000` |

### Producción (Vercel env vars)
| Variable | Descripción |
|----------|-------------|
| `TURSO_DATABASE_URL` | `libsql://nomina-xpress-xxxx.turso.io` (BD propia por cliente) |
| `TURSO_AUTH_TOKEN` | Token de Turso |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | Secreto JWT (32 chars) / URL del despliegue |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Almacenamiento de logos |
| `CRON_SECRET` | Protege `/api/cron/audit-purge` (Vercel Cron) |
| `AUDIT_RETENTION_MONTHS` | Meses de retención de auditoría (opcional, def. 6) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push |
| `NEXT_PUBLIC_INVENTARIO_APP_URL` | Feature flag del módulo inventario (si vacío/ausente = OFF) |
| `BACKUP_GPG_PASSPHRASE` | (Secret de GitHub Actions, no de Vercel) cifra los backups |

## Reglas No Negociables

1. **Aislar por `tenantId` siempre.** Toda query incluye `where: { tenantId: session.user.tenantId }` (cada cliente tiene su propia BD con un único tenant; no se comparte BD entre clientes).
2. **TypeScript strict, cero `any`.** Los cálculos de nómina con tipos incorrectos = salarios erróneos.
3. **`isSpecial` siempre en servidor.** El servidor tiene `date-holidays` y timezone correcto.
4. **Zod en todas las entradas.** Todo input de usuario pasa por schema Zod antes de tocar Prisma.
5. **Server Components por defecto.** Solo `"use client"` cuando hay hooks o event handlers.
6. **Formato de moneda consistente.** Siempre usar `formatCurrency()` de `@/lib/utils`.
