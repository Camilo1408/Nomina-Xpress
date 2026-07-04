import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const url = "libsql://nominaxpress-fiori-camilo1408.aws-us-east-1.turso.io";
const authToken = "***REMOVED***";

const adapter = new PrismaLibSql({ url, authToken });
const prisma = new PrismaClient({ adapter });

const TENANT_ID = "9a66e00a-cde9-4fe5-b951-712931163a72";

async function test(label: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    console.log(`✓ ${label}:`, JSON.stringify(result).slice(0, 150));
  } catch (e: unknown) {
    const err = e as Error;
    console.error(`✗ ${label}: ${err.message}`);
    if ((err as NodeJS.ErrnoException).cause) console.error("  Cause:", (err as NodeJS.ErrnoException & { cause: Error }).cause?.message);
    if (err.stack) console.error("  Stack:", err.stack.split("\n").slice(0, 5).join("\n  "));
  }
}

async function main() {
  console.log("=== TEST PRISMA PRODUCTION QUERIES ===\n");

  await test("user.findUnique(username=Mantenimiento)", () =>
    prisma.user.findUnique({ where: { username: "Mantenimiento" }, include: { employee: true } })
  );

  await test("user.findFirst con customRole+userPermissions", () =>
    prisma.user.findFirst({
      where: { username: "Mantenimiento", tenantId: TENANT_ID },
      include: {
        customRole: { select: { permissions: true, active: true, tenantId: true } },
        userPermissions: { select: { permissionKey: true, granted: true } },
      },
    })
  );

  await test("employee.count", () =>
    prisma.employee.count({ where: { tenantId: TENANT_ID, active: true } })
  );

  await test("timeEntry.findMany(today)", () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    return prisma.timeEntry.findMany({
      where: { tenantId: TENANT_ID, date: today },
      include: { employee: true },
      orderBy: { checkIn: "desc" },
    });
  });

  await test("tenant.findFirst", () =>
    prisma.tenant.findFirst({ where: { id: TENANT_ID } })
  );

  await (prisma as PrismaClient).$disconnect();
  console.log("\n=== DONE ===");
}

main().catch(console.error);
