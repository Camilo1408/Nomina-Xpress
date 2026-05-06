# Restaurant Nómina Xpress

Sistema web de gestión de nómina para restaurantes. Multi-tenant SaaS. Admin registra horas de empleados, el sistema calcula salarios con tarifas diferenciadas para domingos/festivos colombianos, genera reportes PDF/Excel quincenales y mensuales.

## Comandos

- `npm run dev` — Servidor de desarrollo en localhost:3000
- `npm run build` — Build de producción
- `npm run lint` — ESLint
- `npm run test` — Vitest (unit tests)
- `npx prisma migrate dev` — Nueva migración de base de datos
- `npx prisma generate` — Regenerar cliente Prisma
- `npx prisma studio` — GUI de base de datos
- `npx tsx prisma/seed.ts` — Seed: crear tenant + admin de prueba

## Credenciales demo

- **Admin:** admin@demo.com / admin123
- **Empleado:** maria@demo.com / emp123

## Tech Stack

Next.js 16 App Router + TypeScript + Tailwind CSS v4 + shadcn/ui + SQLite (better-sqlite3) + Prisma 7 ORM + NextAuth v5 (Credentials) + @react-pdf/renderer + exceljs + date-holidays

## Architecture

### Prisma 7 — IMPORTANTE

Prisma 7 usa un nuevo motor "client" que requiere un adapter. Aquí usamos `@prisma/adapter-better-sqlite3`.
El cliente se inicializa en `src/lib/db.ts` pasando el adapter. El schema.prisma NO tiene `url` en el datasource — va en `prisma.config.ts`.

El cliente generado está en `src/generated/prisma/` (custom output).

### Rutas de archivo (Next.js 16)

- `middleware.ts` → ahora es `proxy.ts` (renombrado en Next.js 16)
- La función exported es default (compatible con NextAuth `auth()` wrapper)

### Directory Structure

- `src/app/(auth)/` — Rutas de autenticación (login)
- `src/app/(admin)/` — Portal de administrador, protegido: rol ADMIN
- `src/app/(portal)/` — Portal de empleado, protegido: rol EMPLOYEE
- `src/app/api/` — API routes (admin/*, employee/*, auth/*)
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
- Todas las queries incluyen `where: { tenantId: session.user.tenantId }` — regla de oro multi-tenant

### Key Patterns

- Multi-tenant: TODOS los modelos tienen `tenantId`. TODA query filtra por él desde session.
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

## Environment Variables (.env.local)

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | SQLite file path (e.g. `file:./dev.db`) |
| `NEXTAUTH_SECRET` | Secreto JWT (32 chars) |
| `NEXTAUTH_URL` | URL base de la app |

## Reglas No Negociables

1. **Multi-tenant siempre.** Toda query incluye `where: { tenantId: session.user.tenantId }`.
2. **TypeScript strict, cero `any`.** Los cálculos de nómina con tipos incorrectos = salarios erróneos.
3. **`isSpecial` siempre en servidor.** El servidor tiene `date-holidays` y timezone correcto.
4. **Zod en todas las entradas.** Todo input de usuario pasa por schema Zod antes de tocar Prisma.
5. **Server Components por defecto.** Solo `"use client"` cuando hay hooks o event handlers.
6. **Formato de moneda consistente.** Siempre usar `formatCurrency()` de `@/lib/utils`.
