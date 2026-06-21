// Verifica los permisos efectivos de cada usuario y rol del sistema.
// Ejecutar: npx tsx scripts/verify-permissions.mts

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import {
  BASE_ROLE_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  INVENTORY_PERMISSION_KEYS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  type PermissionKey,
} from "../src/lib/permission-keys";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL ?? "file:./dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

// Réplica de getEffectivePermissions (sin importar el módulo server que usa "@/lib/db")
function resolve(user: {
  role: string;
  customRole?: { permissions: string; active: boolean; tenantId: string } | null;
  userPermissions: { permissionKey: string; granted: boolean }[];
}, tenantId: string): Set<string> {
  if (user.role === "PROPRIETARY") return new Set(ALL_PERMISSION_KEYS);
  let base: Set<string>;
  if (user.customRole && user.customRole.active && user.customRole.tenantId === tenantId) {
    const parsed = JSON.parse(user.customRole.permissions) as string[];
    base = new Set(parsed.filter((k) => ALL_PERMISSION_KEYS.includes(k as PermissionKey)));
  } else {
    base = new Set(BASE_ROLE_PERMISSIONS[user.role] ?? []);
  }
  for (const o of user.userPermissions) {
    if (o.granted) base.add(o.permissionKey);
    else base.delete(o.permissionKey);
  }
  return base;
}

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) { console.error("No hay tenant"); process.exit(1); }
  const tenantId = tenant.id;

  const users = await prisma.user.findMany({
    where: { tenantId },
    include: {
      customRole: { select: { name: true, permissions: true, active: true, tenantId: true } },
      userPermissions: { select: { permissionKey: true, granted: true } },
    },
    orderBy: { username: "asc" },
  });

  const INV = PERMISSIONS.INVENTORY_VIEW;
  console.log(`\n═══ PERMISOS EFECTIVOS POR USUARIO (tenant: ${tenant.name}) ═══\n`);
  let allGood = true;
  const invCount = (perms: Set<string>) => INVENTORY_PERMISSION_KEYS.filter((k) => perms.has(k)).length;
  const totalInv = INVENTORY_PERMISSION_KEYS.length;
  for (const u of users) {
    const perms = resolve(u, tenantId);
    // El empleado con toggle inventoryAccess recibe baseline operativo (view + stock:count)
    const empBaseline = u.role === "EMPLOYEE" && u.inventoryAccess ? 2 : 0;
    const ic = Math.max(invCount(perms), empBaseline);
    const roleLabel = u.customRole?.active ? `${u.role} + rol "${u.customRole.name}"` : u.role;
    const expectFullInv = ["ADMIN", "SUPERADMIN", "PROPRIETARY"].includes(u.role) && !u.customRole?.active;
    const invStatus = ic > 0 ? `✅ inventario (${ic}/${totalInv})` : "—  sin inventario";
    const ruleOk = expectFullInv ? ic === totalInv : true;
    if (!ruleOk) allGood = false;
    console.log(`  @${u.username.padEnd(14)} [${roleLabel}]`);
    console.log(`     permisos: ${perms.size}/${ALL_PERMISSION_KEYS.length}  |  ${invStatus}${expectFullInv && ic !== totalInv ? "  ❌ DEBERÍA tener inventario completo" : ""}`);
  }

  console.log(`\n═══ PERMISOS POR ROL BASE ═══\n`);
  for (const role of ["EMPLOYEE", "ADMIN", "SUPERADMIN", "PROPRIETARY"]) {
    const perms = role === "PROPRIETARY" ? new Set<string>(ALL_PERMISSION_KEYS) : new Set<string>(BASE_ROLE_PERMISSIONS[role] ?? []);
    console.log(`  ${role.padEnd(12)} → ${perms.size} permisos  |  inventario: ${invCount(perms)}/${totalInv}`);
  }

  console.log(`\n═══ VERIFICACIÓN: inventory:view en la matriz de roles ═══`);
  const inGroups = PERMISSION_GROUPS.some((g) => g.keys.includes(INV));
  console.log(`  Aparece en PERMISSION_GROUPS (matriz UI): ${inGroups ? "✅ SÍ" : "❌ NO"}`);
  const hasLabel = !!PERMISSION_LABELS[INV];
  console.log(`  Tiene etiqueta legible: ${hasLabel ? "✅ SÍ" : "❌ NO"}`);

  if (!allGood || !inGroups || !hasLabel) {
    console.log("\n❌ Hay inconsistencias en los permisos.");
    process.exit(1);
  }
  console.log("\n✅ Todos los permisos son correctos.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(2); });
