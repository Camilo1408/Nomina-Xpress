/**
 * Script de gestión de usuarios de producción (Turso)
 * Uso: npx tsx scripts/manage-users.ts
 *
 * - Crea AdminJavier (SUPERADMIN) / Javier123
 * - Crea AdminMajo   (SUPERADMIN) / Majo123
 * - Elimina el usuario "admin" de prueba
 */
import { config } from "dotenv";
config({ path: ".env.production" });
import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // Get the tenant (single tenant system)
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error("❌ No se encontró ningún tenant en la base de datos.");
    process.exit(1);
  }
  console.log(`✅ Tenant encontrado: ${tenant.name} (${tenant.id})`);

  // Create AdminJavier
  const existingJavier = await prisma.user.findUnique({ where: { username: "AdminJavier" } });
  if (existingJavier) {
    console.log("⚠️  AdminJavier ya existe, actualizando contraseña...");
    const hash = await bcrypt.hash("Javier123", 12);
    await prisma.user.update({
      where: { username: "AdminJavier" },
      data: { passwordHash: hash, role: "SUPERADMIN" },
    });
  } else {
    const hash = await bcrypt.hash("Javier123", 12);
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        username: "AdminJavier",
        passwordHash: hash,
        role: "SUPERADMIN",
      },
    });
    console.log("✅ AdminJavier creado (SUPERADMIN)");
  }

  // Create AdminMajo
  const existingMajo = await prisma.user.findUnique({ where: { username: "AdminMajo" } });
  if (existingMajo) {
    console.log("⚠️  AdminMajo ya existe, actualizando contraseña...");
    const hash = await bcrypt.hash("Majo123", 12);
    await prisma.user.update({
      where: { username: "AdminMajo" },
      data: { passwordHash: hash, role: "SUPERADMIN" },
    });
  } else {
    const hash = await bcrypt.hash("Majo123", 12);
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        username: "AdminMajo",
        passwordHash: hash,
        role: "SUPERADMIN",
      },
    });
    console.log("✅ AdminMajo creado (SUPERADMIN)");
  }

  // Delete test "admin" user (only if it exists and is not linked to an employee)
  const testAdmin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (testAdmin) {
    if (testAdmin.employeeId) {
      console.log("⚠️  El usuario 'admin' está vinculado a un empleado. No se eliminó. Desvincúlalo manualmente si quieres eliminarlo.");
    } else {
      await prisma.user.delete({ where: { username: "admin" } });
      console.log("🗑️  Usuario de prueba 'admin' eliminado");
    }
  } else {
    console.log("ℹ️  El usuario 'admin' no existe (ya fue eliminado)");
  }

  console.log("\n--- Usuarios activos SUPERADMIN ---");
  const superadmins = await prisma.user.findMany({
    where: { tenantId: tenant.id, role: "SUPERADMIN" },
    select: { username: true, role: true, createdAt: true },
  });
  superadmins.forEach((u) => console.log(`  • ${u.username} (${u.role})`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
