# Restaurant Nómina Xpress

Sistema web de gestión de nómina para restaurantes. **Cada cliente se despliega de forma independiente, con su propia base de datos** (un único restaurante por base — NO es un SaaS multi-tenant compartido). Admin registra horas de empleados, el sistema calcula salarios con tarifas diferenciadas para domingos/festivos colombianos, genera reportes PDF/Excel quincenales y mensuales.

## Comandos

- `npm run dev` — Servidor de desarrollo en localhost:3000
- `npm run build` — Build de producción
- `npm run lint` — ESLint
- `npm run test` — Vitest (unit tests)
- `npm run test:e2e` — Playwright (`e2e/*.spec.ts`): navegador real contra el **build de producción**
  (`npm run build` antes) con una SQLite efímera `e2e.db` sembrada con `seed-local`. Lo arranca
  `e2e/start-server.mjs` en el puerto 3100; no toca `dev.db` ni Turso. Un solo worker: las pruebas
  comparten base y algunas bloquean o desactivan usuarios (deben dejar la semilla como estaba).
- CI (`.github/workflows/ci.yml`) en cada PR y push a `main`: `tsc`, ESLint con **0 errores**,
  Vitest, `npm run build` y `npm audit --omit=dev --audit-level=critical`. No usa secretos:
  corre contra una SQLite vacía.
  Un segundo job, **E2E (Playwright)**, corre `npm run test:e2e` (CP-40, G10).
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

Son credenciales de **prueba y públicas** (el demo en la nube usa las del seed integral).
Las semillas se niegan a correr contra una base remota salvo `NX_ALLOW_REMOTE_SEED=1`.
**Nunca escribas contraseñas reales** en scripts, docs ni pruebas: los scripts operativos
usan `scripts/lib/credentials.mjs` (`NX_PASSWORD_<USUARIO>` o clave aleatoria mostrada
una sola vez) y los E2E contra un servidor remoto exigen sus `*_USER` / `*_PASS`.

## Tech Stack

Next.js 16 App Router + TypeScript + Tailwind CSS v4 + shadcn/ui + SQLite local / Turso (libSQL) en prod + Prisma 7 ORM + NextAuth v5 (Credentials) + @react-pdf/renderer + exceljs + date-holidays

## Architecture

### Prisma 7 — IMPORTANTE

Prisma 7 usa un nuevo motor "client" que requiere un adapter. Aquí usamos **`@prisma/adapter-libsql`** (`@libsql/client`) para local y producción por igual: en local `TURSO_DATABASE_URL` apunta a `file:./dev.db`; en producción a la URL `libsql://…` de Turso.
El cliente se inicializa en `src/lib/db.ts` pasando el adapter. El `schema.prisma` NO tiene `url` en el datasource — va en `prisma.config.ts` (lee `TURSO_DATABASE_URL`).

**Migraciones — no usar `prisma migrate deploy`.** El historial de `prisma/migrations/`
está desincronizado desde junio de 2026: `Bonus`, `Discount`, `Holiday`,
`InventoryCategory` y los modelos `Contest*` no están ahí, y la tabla
`_prisma_migrations` del `dev.db` local está vacía (se construyó con `db push`).
Los cambios de esquema se aplican con scripts idempotentes propios
(`prisma/turso-migrate-*.mjs`), cada uno con su rollback. Es el patrón a seguir para
cualquier cambio nuevo de base de datos.

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

### Sesiones (RN-19)

Sesión JWT de **12 h**, renovada cada hora (`src/lib/session-guard.ts`). Cada `User` tiene
`sessionVersion`; el token guarda la versión al iniciar sesión (`sv`) y el callback
`jwt()` de `auth.ts` invalida la sesión (devuelve `null`) si el usuario fue eliminado,
desactivado o su versión cambió. `getEffectivePermissions` devuelve vacío para usuarios
inactivos. **Toda ruta que desactive un usuario o cambie su contraseña, usuario, rol o rol
personalizado debe incluir `...sessionRevocationData()` en el `update`.** La auditoría
nunca guarda hashes de contraseña. Los permisos individuales se resuelven en cada
request: no exigen volver a iniciar sesión.

**Inventory comparte la cookie pero no la base** (I-H1b): pregunta por la sesión en
`POST /api/inventory-permissions/session` con un token cifrado con `NEXTAUTH_SECRET` y la sal
`SESSION_CHECK_SALT` (distinta de la de la cookie, así que una cookie robada no sirve). La
respuesta sale de `resolveSessionState()` (`src/lib/session-state.ts`), **la misma función
del callback `jwt()`**: no dupliques esa lógica. Cambiar la sal rompe a Inventory.

### Inicio de sesión (CP-45, CP-46)

`authorize` vive en `src/lib/login.ts`. **bcrypt corre siempre**, también contra un hash de
relleno si el usuario no existe o está desactivado, para que el tiempo no revele qué
usuarios existen. El **límite de intentos** está en `src/lib/login-throttle.ts`, sobre la
tabla `LoginThrottle` (sin `tenantId`: el intento ocurre antes de conocer el tenant):
5 fallos por usuario+IP o 20 por usuario en 15 min bloquean 15, 30 y luego 60 min. Si esa
tabla falla, el login sigue sin límite (falla abierta, queda en el log). PROPRIETARY y
SUPERADMIN desbloquean y restablecen contraseñas desde Usuarios del portal
(`POST /api/admin/users/[id]/unlock`). **Toda ruta que cambie una contraseña debe llamar
`clearLoginLock(username)`.** Las contraseñas nuevas exigen 10 caracteres
(`newPasswordSchema` de `src/lib/password-policy.ts`).

### Techo de delegación (RN-20)

`src/lib/delegation.ts`. Salvo el PROPRIETARY, **nadie otorga permisos que no tiene ni
gestiona a un usuario con permisos que él no tiene** (restablecer su clave incluido), y
**nadie se cambia a sí mismo** el rol, el rol personalizado, el estado ni los permisos
individuales. Toda ruta que asigne un rol, un rol personalizado o permisos, o que cree o
edite un rol personalizado, pasa por `checkTargetChange` / `ungrantable`. Un ADMIN o
SUPERADMIN con su rol base puede delegar las categorías del inventario diario (las opera
por su rol). PROPRIETARY y SUPERADMIN abren Usuarios del portal aunque no tengan
`users:view`, solo para desbloquear y restablecer claves. Si el PROPRIETARY olvida su clave:
`scripts/reset-password.mjs <usuario> --si` (nunca `prod-reset-users.mjs`, que borra a todos).

### Directory Structure

- `src/app/(auth)/` — Rutas de autenticación (login) — único route group
- `src/app/admin/` — Portal de administración (dashboard, personal, horas, horarios, propinas, reportes, roles, usuarios, auditoría, festivos, configuración). Acceso por permisos efectivos.
- `src/app/portal/` — Portal de empleado (mi quincena, mi horario, perfil). Rol EMPLOYEE.
- `src/app/api/` — API routes (`admin/*`, `employee/*`, `auth/*`, `cron/*`, `inventory-permissions/*`)
- `src/components/ui/` — shadcn/ui primitives
- `src/components/admin/` — Componentes específicos del admin
- `src/components/portal/` — Componentes del portal empleado
- `src/components/shared/` — Componentes compartidos (AdminSidebar, PortalNav)
- `src/lib/` — Utilidades core: auth.ts, db.ts, holidays.ts, special-days.ts, shift-times.ts, payroll.ts, payroll-report.ts, feature-flags.ts, color-contrast.ts, utils.ts
- `src/lib/pdf/` — Plantilla PDF de nómina
- `src/lib/excel/` — Plantilla Excel de nómina
- `src/types/` — Tipos TypeScript compartidos
- `docs/img/` — Capturas del manual de usuario (**generadas** con `node scripts/capture-docs-screenshots.mjs`, no editar a mano)

### Data Flow

- Server Components leen de base de datos directamente vía `prisma` client
- Mutaciones van por API routes (POST/PUT/DELETE) llamadas desde componentes cliente
- NUNCA hacer fetch desde Server Component a una API route propia — usar Prisma directamente
- Todas las queries incluyen `where: { tenantId: session.user.tenantId }` — aislamiento de datos por `tenantId` (aunque cada BD tenga un solo cliente)

### Key Patterns

- Aislamiento por `tenantId`: TODOS los modelos lo tienen y TODA query filtra por él desde session. **No es un SaaS multi-tenant compartido** — cada cliente se despliega aparte con su **propia base de datos** (un único tenant por BD); el `tenantId` es aislamiento de datos heredado del diseño.
- `isSpecial` en TimeEntry se calcula en el servidor al crear/editar (nunca en cliente) con `isSpecialDayForTenant()` de `@/lib/special-days` — domingo ∪ festivo nacional ∪ festivo personalizado del tenant (`Holiday`). NO usar `isSpecialDay` de `holidays.ts` en rutas nuevas: ignora los festivos del cliente.
- Crear/editar/eliminar un `Holiday` dispara **recálculo retroactivo** de `isSpecial` y de las propinas de las fechas afectadas (`recalculateSpecialForDates`).
- Reglas de turno en `@/lib/shift-times` (isomorfo cliente+servidor): cruce de medianoche hasta las **02:00**, tope de **15 h/día**, aviso (no bloqueo) a partir de **8 h/día**, máx. **2 turnos/día** sin solaparse. El servidor es la autoridad: revalidar también en el `PUT`.
- Quincenas: usar los helpers de `utils.ts` (`getBiweeklyPeriodForDate`, `getCurrentBiweeklyPeriod`, `lastDayOfMonth`); no duplicar el cálculo ni usar `toISOString` para fechas.
- **Cadena del pago (invariante).** `grossPay` = horas × tarifa. `netPay` = `grossPay + totalAdjustments` (los ajustes YA están dentro del neto). `finalPay` = `clampFinalPay(netPay, bonos, descuentos)`. **Las propinas nunca entran en el total a pagar** — se informan aparte. Las cuatro superficies (pantalla, PDF, Excel, portal del empleado) deben pasar `netPay` a `clampFinalPay`, nunca `netPayWithTips`; hay pruebas que fallan si divergen.
- **Ajustes de pago por período.** Un `PayAdjustment` pertenece a un reporte si su `periodStart` cae dentro de `[from, to]` (anclaje en el inicio, no contención). Así un ajuste con el rango desalineado no desaparece y un reporte de varios meses los trae todos sin duplicar. Corregir sus fechas exige `pay_adjustments:edit_period` (PROPRIETARY y SUPERADMIN).
- **Bonos y descuentos recurrentes en rangos largos.** `biweeklyPeriodsInRange(from, to)` descompone el rango en quincenas y el bono se aplica una vez por quincena. Un rango que no contenga ningún inicio de quincena cae al comportamiento histórico (una sola aplicación).
- **Concursos e incentivos** (`/admin/contests`): premios financiados con un % adicional
  de las propinas. La invariante que sostiene el módulo, por día, es
  `TipEntry.totalAmount = menaje + contestReserved + netAmount`; el neto se obtiene
  **por resta**, nunca por porcentaje, para que la suma cuadre al peso. Solo un concurso
  `ACTIVO` reserva; al `FINALIZAR` su reserva se congela (`fixedAmount`) y ya no la mueve
  un recálculo posterior. Cancelar un concurso o declarar un ítem desierto **no tienen
  código propio**: cambian el estado y recalculan, la reserva queda `DEVUELTA` y el dinero
  vuelve al reparto. El único punto que decide qué descuenta un día es
  `resolveContestDeductionsForDate()` en `contest-service.ts`.
- El bono de concurso es **informativo**: aparece en reportes y portal junto a las
  propinas, pero NUNCA entra en `finalPay`.
- **Rutas de la API (CP-49, CP-50).** Leer el cuerpo con `readJsonBody(req)` de
  `@/lib/api-response` (un JSON roto responde 400, no 500) y separar las guardias:
  `if (!session) return unauthorized();` (401) y luego `if (!permiso) return forbidden();`
  (403). `src/app/api/__tests__/api-contract.test.ts` falla si una ruta vuelve a
  `await req.json()` sin guarda o mezcla los dos casos en un 401.
- **Altas con acceso (RN-21).** Validar el usuario ANTES de crear nada y crear empleado +
  `User` en una sola `$transaction`; un `P2002` dentro responde 409 sin dejar huérfanos.
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
| `AUTH_COOKIE_DOMAIN` | Dominio de la cookie de sesión compartida con inventario (p. ej. `.cucinadeifiori.com`). Sin definir = cookie host-only por defecto |
| `BACKUP_GPG_PASSPHRASE` | (Secret de GitHub Actions, no de Vercel) cifra los backups |
| `DB_TARGETS` | (Secret de GitHub Actions) JSON `[{name,url,token}]` por cliente; usado por backup-db.yml y migrate-db.yml |

## Reglas No Negociables

1. **Aislar por `tenantId` siempre.** Toda query incluye `where: { tenantId: session.user.tenantId }` (cada cliente tiene su propia BD con un único tenant; no se comparte BD entre clientes).
2. **TypeScript strict, cero `any`.** Los cálculos de nómina con tipos incorrectos = salarios erróneos.
3. **`isSpecial` siempre en servidor.** El servidor tiene `date-holidays` y timezone correcto.
4. **Zod en todas las entradas.** Todo input de usuario pasa por schema Zod antes de tocar Prisma.
5. **Server Components por defecto.** Solo `"use client"` cuando hay hooks o event handlers.
6. **Formato de moneda consistente.** Siempre usar `formatCurrency()` de `@/lib/utils`.
7. **Cero secretos en el repositorio.** Ni contraseñas, ni tokens, ni URLs de producción con credenciales. El repositorio es público y tiene secret scanning y push protection activos.
8. **Migración antes que código.** Un cambio de esquema se aplica con su script en el demo antes del merge y en cada cliente antes de promoverlo (ver `DESPLIEGUES.md`).
