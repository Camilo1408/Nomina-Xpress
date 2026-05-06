import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const existing = await prisma.tenant.findFirst();
  if (existing) {
    console.log("Seed already applied. Skipping.");
    return;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: "Restaurante Demo",
      primaryColor: "#C1643F",
      secondaryColor: "#8B6355",
    },
  });

  // Admin burned-in: username "admin" / password "admin123"
  const adminHash = await bcrypt.hash("admin123", 12);
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "admin",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });

  const emp1 = await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      name: "María García",
      documentId: "12345678",
      phone: "3001234567",
      hourlyRateNormal: 6400,
      hourlyRateSpecial: 11500,
    },
  });

  const empHash = await bcrypt.hash("emp123", 12);
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "maria",
      passwordHash: empHash,
      role: "EMPLOYEE",
      employeeId: emp1.id,
    },
  });

  await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      name: "Carlos López",
      documentId: "87654321",
      phone: "3109876543",
      hourlyRateNormal: 7200,
      hourlyRateSpecial: 12500,
    },
  });

  await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      name: "Ana Martínez",
      documentId: "11223344",
      hourlyRateNormal: 6800,
      hourlyRateSpecial: 11800,
    },
  });

  console.log("✅ Seed completado.");
  console.log("   Admin:    usuario: admin    / contraseña: admin123");
  console.log("   Empleado: usuario: maria    / contraseña: emp123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
