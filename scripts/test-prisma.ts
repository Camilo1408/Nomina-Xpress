/**
 * Prueba las mismas queries que usa el dashboard con Prisma real.
 * Ejecutar: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/test-prisma.ts
 */
import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const url = process.env.TURSO_DATABASE_URL ?? "libsql://nominaxpress-fiori-camilo1408.aws-us-east-1.turso.io";
const authToken = process.env.TURSO_AUTH_TOKEN ?? "***REMOVED***";

const adapter = new PrismaLibSql({ url, authToken });
const prisma = new PrismaClient({ adapter });

const TENANT_ID = "9a66e00a-cde9-4fe5-b951-712931163a72";

async function test(label: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    console.log(`✓ ${label}:`, JSON.stringify(result).slice(0, 120));
  } catch (e: unknown) {
    const err = e as Error;
    console.error(`✗ ${label}: ${err.message}`);
    if (err.stack) console.error("  Stack:", err.stack.split("\n").slice(0,4).join("\n  "));
  }
}

console.log("=== TEST PRISMA PRODUCTION QUERIES ===\n");

// Test 1: findUnique por username (usado en auth)
await test("user.findUnique(username=Mantenimiento)", () =>
  prisma.user.findUnique({ where: { username: "Mantenimiento" }, include: { employee: true } })
);

// Test 2: findFirst con include (usado en getEffectivePermissions)
await test("user.findFirst con customRole+userPermissions", () =>
  prisma.user.findFirst({
    where: { username: "Mantenimiento", tenantId: TENANT_ID },
    include: {
      customRole: { select: { permissions: true, active: true, tenantId: true } },
      userPermissions: { select: { permissionKey: true, granted: true } },
    },
  })
);

// Test 3: employee.count (usado en dashboard)
await test("employee.count", () =>
  prisma.employee.count({ where: { tenantId: TENANT_ID, active: true } })
);

// Test 4: timeEntry.findMany (usado en dashboard)
await test("timeEntry.findMany(today)", () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  return prisma.timeEntry.findMany({
    where: { tenantId: TENANT_ID, date: today },
    include: { employee: true },
    orderBy: { checkIn: "desc" },
  });
});

// Test 5: Tenant info
await test("tenant.findFirst", () =>
  prisma.tenant.findFirst({ where: { id: TENANT_ID } })
);

await prisma.$disconnect();
console.log("\n=== DONE ===");
