# Merge deploy-fiori → local-inventory + DB Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar todos los nuevos módulos de deploy-fiori (propinas, bonos, descuentos, RBAC, auditoría, alertas, PROPRIETARY role) en local-inventory sin romper la integración de inventario existente, y resetear la BD con los usuarios especificados.

**Architecture:** Merge git de deploy-fiori en local-inventory; el schema de deploy-fiori es superset del local (ya contiene `inventoryAccess`). Los conflictos se resuelven tomando deploy-fiori como base, preservando los 4-5 archivos únicos de inventory. Se crea un seed local (better-sqlite3) con los 5 usuarios especificados.

**Tech Stack:** Next.js 16 + Prisma 7 + better-sqlite3 + NextAuth v5 + SQLite local + bcryptjs

## Global Constraints

- Multi-tenant: toda query incluye `tenantId`
- No borrar `src/app/api/admin/employees/[id]/inventory-access/route.ts` — es exclusivo de local-inventory
- El schema final debe tener AMBOS: campos de inventario (`inventoryAccess`) Y los nuevos (tips, bonos, RBAC, audit)
- Deploy-fiori ya tiene `inventoryAccess` en User → no hay conflicto real de schema
- El seed usa el adapter de better-sqlite3 (NO libsql) para local
- Roles permitidos: `PROPRIETARY | SUPERADMIN | ADMIN | EMPLOYEE`
- proxy.ts final debe usar `ADMIN_PORTAL_ROLES = ["ADMIN", "SUPERADMIN", "PROPRIETARY"]`

---

### Task 1: Merge deploy-fiori → local-inventory

**Files:**
- Modify: `prisma/schema.prisma` (tomar deploy-fiori — superset)
- Modify: `src/proxy.ts` (tomar deploy-fiori — manejo correcto de PROPRIETARY)
- Preserve: `src/app/api/admin/employees/[id]/inventory-access/route.ts`
- Accept: todos los demás archivos de deploy-fiori (nuevos módulos)

- [ ] **Step 1: Hacer el merge**
```bash
git merge deploy-fiori
```
Esperar salida de conflictos. Git mostrará qué archivos tienen conflictos.

- [ ] **Step 2: Resolver conflictos de schema.prisma**
Tomar la versión de deploy-fiori (es superset). Ya incluye `inventoryAccess Boolean @default(false)` en User.
```bash
git checkout deploy-fiori -- prisma/schema.prisma
```

- [ ] **Step 3: Resolver conflicto de proxy.ts**
Tomar deploy-fiori (maneja PROPRIETARY correctamente, matcher correcto):
```bash
git checkout deploy-fiori -- src/proxy.ts
```

- [ ] **Step 4: Verificar que inventory-access route no se perdió**
```bash
ls src/app/api/admin/employees/[id]/
```
Si no existe `inventory-access/route.ts`, restaurarlo:
```bash
git checkout HEAD -- "src/app/api/admin/employees/[id]/inventory-access/route.ts"
```

- [ ] **Step 5: Resolver restantes conflictos aceptando deploy-fiori**
Para cualquier otro archivo en conflicto, tomar deploy-fiori:
```bash
git diff --name-only --diff-filter=U
# Para cada archivo en conflicto:
git checkout deploy-fiori -- <archivo>
```

- [ ] **Step 6: Completar el merge**
```bash
git add -A
git commit -m "merge: integrar deploy-fiori en local-inventory — tips, bonos, descuentos, RBAC, auditoría"
```

---

### Task 2: Migración de base de datos

**Files:**
- Modify: `prisma/dev.db` (aplicar nuevas tablas)

- [ ] **Step 1: Generar cliente Prisma**
```bash
npx prisma generate
```

- [ ] **Step 2: Aplicar schema a la BD local con push**
(Más seguro que migrate dev en este contexto de merge)
```bash
npx prisma db push --force-reset
```
Esto resetea la BD y aplica el schema completo. Datos anteriores se pierden (se re-seedean en Task 3).

- [ ] **Step 3: Verificar tablas creadas**
```bash
echo "SELECT name FROM sqlite_master WHERE type='table';" | npx prisma db execute --stdin
```

---

### Task 3: Seed local con usuarios especificados

**Files:**
- Create: `prisma/seed-local.ts`

- [ ] **Step 1: Escribir seed-local.ts**

```typescript
import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

// Seed local — usa la misma config que la app (adapter better-sqlite3 via prisma.config.ts)
// Ejecutar con: npx tsx prisma/seed-local.ts

const { createClient } = await import("@libsql/client");

const client = createClient({ url: "file:./prisma/dev.db" });
const { PrismaLibSql } = await import("@prisma/adapter-libsql");
const adapter = new PrismaLibSql(client);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🧹 Limpiando BD...");
  // Borrar en orden correcto (FK constraints)
  await prisma.auditLog.deleteMany({});
  await prisma.userPermission.deleteMany({});
  await prisma.tipDistribution.deleteMany({});
  await prisma.tipEntry.deleteMany({});
  await prisma.bonusAssignment.deleteMany({});
  await prisma.bonus.deleteMany({});
  await prisma.discountAssignment.deleteMany({});
  await prisma.discount.deleteMany({});
  await prisma.payAdjustment.deleteMany({});
  await prisma.scheduleShift.deleteMany({});
  await prisma.schedule.deleteMany({});
  await prisma.timeEntry.deleteMany({});
  await prisma.pushSubscription.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.tenant.deleteMany({});

  console.log("🏗️  Creando tenant...");
  const tenant = await prisma.tenant.create({
    data: {
      name: "Restaurante Demo",
      primaryColor: "#C1643F",
      secondaryColor: "#8B6355",
    },
  });

  console.log("👥 Creando usuarios...");

  // PROPRIETARY — acceso total al sistema
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "SadminJavier",
      passwordHash: await bcrypt.hash("Javier123", 12),
      role: "PROPRIETARY",
    },
  });

  // SUPERADMIN
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "SadminMajo",
      passwordHash: await bcrypt.hash("Majo123", 12),
      role: "SUPERADMIN",
    },
  });

  // ADMIN
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "AdminValen",
      passwordHash: await bcrypt.hash("Valen123", 12),
      role: "ADMIN",
    },
  });

  // EMPLOYEE — con inventoryAccess
  const empCesar = await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      name: "Cesar H",
      hourlyRateNormal: 6900,
      hourlyRateSpecial: 11400,
      payType: "PAYROLL",
    },
  });
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "CesarH",
      passwordHash: await bcrypt.hash("CesarH123", 12),
      role: "EMPLOYEE",
      employeeId: empCesar.id,
      inventoryAccess: true,
    },
  });

  // EMPLOYEE — sin inventoryAccess
  const empVanessa = await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      name: "Vanessa",
      hourlyRateNormal: 6900,
      hourlyRateSpecial: 11400,
      payType: "PAYROLL",
    },
  });
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "Vanessa",
      passwordHash: await bcrypt.hash("Vanessa123", 12),
      role: "EMPLOYEE",
      employeeId: empVanessa.id,
      inventoryAccess: false,
    },
  });

  // Empleados adicionales sin acceso al sistema (para datos de prueba)
  await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      name: "Carlos López",
      documentId: "87654321",
      phone: "3109876543",
      hourlyRateNormal: 7200,
      hourlyRateSpecial: 12500,
      payType: "PAYROLL",
    },
  });
  await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      name: "Ana Martínez",
      documentId: "11223344",
      hourlyRateNormal: 6800,
      hourlyRateSpecial: 11800,
      payType: "SHIFT",
    },
  });

  console.log("✅ Seed completado.");
  console.log("   SadminJavier / Javier123  → PROPRIETARY");
  console.log("   SadminMajo   / Majo123    → SUPERADMIN");
  console.log("   AdminValen   / Valen123   → ADMIN");
  console.log("   CesarH       / CesarH123 → EMPLOYEE (inventoryAccess=true)");
  console.log("   Vanessa      / Vanessa123 → EMPLOYEE");
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Ejecutar seed**
```bash
npx tsx prisma/seed-local.ts
```
Verificar que muestra "✅ Seed completado." sin errores.

---

### Task 4: Verificar proxy.ts y tipos NextAuth

**Files:**
- Verify: `src/proxy.ts`
- Verify: `src/types/next-auth.d.ts`

- [ ] **Step 1: Confirmar PROPRIETARY en proxy.ts**
El archivo final debe tener:
```typescript
const ADMIN_PORTAL_ROLES = ["ADMIN", "SUPERADMIN", "PROPRIETARY"];
```
y el matcher:
```typescript
matcher: ["/((?!_next|api/auth|api/cron|favicon\\.ico|uploads|sw\\.js|manifest\\.json|icon-).*)" ],
```

- [ ] **Step 2: Confirmar tipos de sesión**
`src/types/next-auth.d.ts` debe extender Session/JWT con los campos usados: `id`, `role`, `tenantId`, `employeeId`, `inventoryAccess`.

---

### Task 5: Pruebas funcionales

- [ ] **Step 1: Iniciar servidor**
```bash
npm run dev
```
Confirmar "Ready" sin errores en consola.

- [ ] **Step 2: Test login SadminJavier (PROPRIETARY)**
- Ir a `localhost:3000` → debe redirigir a `/login`
- Login con `SadminJavier` / `Javier123`
- Debe redirigir a `/admin/dashboard`
- El sidebar debe mostrar todos los módulos incluyendo Auditoría y Roles

- [ ] **Step 3: Test login CesarH (EMPLOYEE + inventoryAccess)**
- Logout → Login con `CesarH` / `CesarH123`
- Debe redirigir a `/portal/report`
- El portal debe mostrar botón de Inventario

- [ ] **Step 4: Test login Vanessa (EMPLOYEE sin inventoryAccess)**
- Logout → Login con `Vanessa` / `Vanessa123`
- Debe redirigir a `/portal/report`
- El portal NO debe mostrar botón de Inventario

- [ ] **Step 5: Confirmar módulos nuevos accesibles con SadminJavier**
- `/admin/tips` → debe cargar
- `/admin/roles` → debe cargar
- `/admin/audit` → debe cargar
