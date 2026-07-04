/**
 * Adds missing UNIQUE indices to the production Turso DB.
 * Prisma's findUnique relies on these existing in the actual DB.
 * Run once: node scripts/fix-indices.mjs
 */
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "libsql://nominaxpress-fiori-camilo1408.aws-us-east-1.turso.io",
  authToken: process.env.TURSO_AUTH_TOKEN ?? "***REMOVED***",
});

const indices = [
  // User unique constraints
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_employeeId_key" ON "User"("employeeId")`,
  // Regular indices on User
  `CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId")`,
  // TipEntry unique constraint
  `CREATE UNIQUE INDEX IF NOT EXISTS "TipEntry_tenantId_date_key" ON "TipEntry"("tenantId", "date")`,
  // PushSubscription unique constraint
  `CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint")`,
  // BonusAssignment unique constraint
  `CREATE UNIQUE INDEX IF NOT EXISTS "BonusAssignment_bonusId_employeeId_key" ON "BonusAssignment"("bonusId", "employeeId")`,
  // DiscountAssignment unique constraint
  `CREATE UNIQUE INDEX IF NOT EXISTS "DiscountAssignment_discountId_employeeId_key" ON "DiscountAssignment"("discountId", "employeeId")`,
  // UserPermission unique constraint
  `CREATE UNIQUE INDEX IF NOT EXISTS "UserPermission_userId_permissionKey_key" ON "UserPermission"("userId", "permissionKey")`,
  // CustomRole unique constraint
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustomRole_tenantId_slug_key" ON "CustomRole"("tenantId", "slug")`,
  // Regular performance indices
  `CREATE INDEX IF NOT EXISTS "Employee_tenantId_idx" ON "Employee"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "TimeEntry_tenantId_employeeId_idx" ON "TimeEntry"("tenantId", "employeeId")`,
  `CREATE INDEX IF NOT EXISTS "TimeEntry_tenantId_date_idx" ON "TimeEntry"("tenantId", "date")`,
  `CREATE INDEX IF NOT EXISTS "Schedule_tenantId_idx" ON "Schedule"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "ScheduleShift_scheduleId_idx" ON "ScheduleShift"("scheduleId")`,
  `CREATE INDEX IF NOT EXISTS "ScheduleShift_employeeId_idx" ON "ScheduleShift"("employeeId")`,
  `CREATE INDEX IF NOT EXISTS "PayAdjustment_tenantId_employeeId_idx" ON "PayAdjustment"("tenantId", "employeeId")`,
  `CREATE INDEX IF NOT EXISTS "PushSubscription_tenantId_idx" ON "PushSubscription"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId")`,
  `CREATE INDEX IF NOT EXISTS "TipEntry_tenantId_idx" ON "TipEntry"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "TipEntry_tenantId_periodStart_periodEnd_idx" ON "TipEntry"("tenantId", "periodStart", "periodEnd")`,
  `CREATE INDEX IF NOT EXISTS "TipDistribution_tenantId_employeeId_idx" ON "TipDistribution"("tenantId", "employeeId")`,
  `CREATE INDEX IF NOT EXISTS "TipDistribution_tipEntryId_idx" ON "TipDistribution"("tipEntryId")`,
  `CREATE INDEX IF NOT EXISTS "Bonus_tenantId_idx" ON "Bonus"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "Bonus_tenantId_active_idx" ON "Bonus"("tenantId", "active")`,
  `CREATE INDEX IF NOT EXISTS "BonusAssignment_tenantId_idx" ON "BonusAssignment"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "BonusAssignment_bonusId_idx" ON "BonusAssignment"("bonusId")`,
  `CREATE INDEX IF NOT EXISTS "BonusAssignment_employeeId_idx" ON "BonusAssignment"("employeeId")`,
  `CREATE INDEX IF NOT EXISTS "Discount_tenantId_idx" ON "Discount"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "Discount_tenantId_active_idx" ON "Discount"("tenantId", "active")`,
  `CREATE INDEX IF NOT EXISTS "DiscountAssignment_tenantId_idx" ON "DiscountAssignment"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "DiscountAssignment_discountId_idx" ON "DiscountAssignment"("discountId")`,
  `CREATE INDEX IF NOT EXISTS "DiscountAssignment_employeeId_idx" ON "DiscountAssignment"("employeeId")`,
  `CREATE INDEX IF NOT EXISTS "CustomRole_tenantId_idx" ON "CustomRole"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "UserPermission_tenantId_userId_idx" ON "UserPermission"("tenantId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_action_idx" ON "AuditLog"("tenantId", "action")`,
  `CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_module_idx" ON "AuditLog"("tenantId", "module")`,
  `CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_userId_idx" ON "AuditLog"("tenantId", "userId")`,
];

console.log(`Applying ${indices.length} index statements...\n`);

let ok = 0;
let fail = 0;
for (const sql of indices) {
  const name = sql.match(/"([^"]+)"/)?.[1] ?? sql.slice(0, 60);
  try {
    await db.execute(sql);
    console.log(`  ✓  ${name}`);
    ok++;
  } catch (e) {
    console.log(`  ✗  ${name}: ${e.message}`);
    fail++;
  }
}

console.log(`\nDone: ${ok} OK, ${fail} failed.`);
await db.close();
