-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TipEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "menaje" REAL NOT NULL,
    "netAmount" REAL NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TipEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TipDistribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tipEntryId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "hoursWorked" REAL NOT NULL,
    "tipPercent" REAL NOT NULL,
    "effectiveHours" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TipDistribution_tipEntryId_fkey" FOREIGN KEY ("tipEntryId") REFERENCES "TipEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TipDistribution_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentId" TEXT,
    "phone" TEXT,
    "hourlyRateNormal" REAL NOT NULL DEFAULT 6400,
    "hourlyRateSpecial" REAL NOT NULL DEFAULT 11500,
    "tipPercent" REAL NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("active", "createdAt", "documentId", "hourlyRateNormal", "hourlyRateSpecial", "id", "name", "phone", "tenantId", "updatedAt") SELECT "active", "createdAt", "documentId", "hourlyRateNormal", "hourlyRateSpecial", "id", "name", "phone", "tenantId", "updatedAt" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE INDEX "Employee_tenantId_idx" ON "Employee"("tenantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_tenantId_idx" ON "PushSubscription"("tenantId");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "TipEntry_tenantId_idx" ON "TipEntry"("tenantId");

-- CreateIndex
CREATE INDEX "TipEntry_tenantId_periodStart_periodEnd_idx" ON "TipEntry"("tenantId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "TipEntry_tenantId_date_key" ON "TipEntry"("tenantId", "date");

-- CreateIndex
CREATE INDEX "TipDistribution_tenantId_employeeId_idx" ON "TipDistribution"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "TipDistribution_tipEntryId_idx" ON "TipDistribution"("tipEntryId");
