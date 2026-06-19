-- CreateTable CustomRole: roles personalizados gestionados por PROPRIETARY
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable UserPermission: overrides de permisos por usuario individual
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex CustomRole: unicidad slug por tenant
CREATE UNIQUE INDEX "CustomRole_tenantId_slug_key" ON "CustomRole"("tenantId", "slug");

-- CreateIndex CustomRole: búsqueda por tenant
CREATE INDEX "CustomRole_tenantId_idx" ON "CustomRole"("tenantId");

-- CreateIndex UserPermission: un permiso por usuario
CREATE UNIQUE INDEX "UserPermission_userId_permissionKey_key" ON "UserPermission"("userId", "permissionKey");

-- CreateIndex UserPermission: búsqueda por tenant+usuario
CREATE INDEX "UserPermission_tenantId_userId_idx" ON "UserPermission"("tenantId", "userId");

-- AlterTable User: añadir customRoleId (nullable) y active
ALTER TABLE "User" ADD COLUMN "customRoleId" TEXT REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
