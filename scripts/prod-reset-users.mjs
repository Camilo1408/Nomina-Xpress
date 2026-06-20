// Reset completo de usuarios en producción (Turso): elimina todos y crea los 6 nuevos.
import { config } from "dotenv";
config({ path: ".env.production" });

import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

const tenant = await prisma.tenant.findFirst();
if (!tenant) {
  console.error("❌ No hay tenant en la base de datos de producción.");
  process.exit(1);
}
console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

const users = [
  { username: "SadminJavier", password: "Javier123",    role: "PROPRIETARY", employee: null },
  { username: "SadminMajo",   password: "Majo123",      role: "SUPERADMIN",  employee: null },
  { username: "AdminMajo",    password: "AdminMajo123", role: "ADMIN",       employee: null },
  { username: "AdminValen",   password: "Valen123",     role: "ADMIN",       employee: null },
  { username: "CesarH",       password: "CesarH123",    role: "EMPLOYEE",    employee: { name: "Cesar H", payType: "PAYROLL" } },
  { username: "Vanessa",      password: "Vanessa123",   role: "EMPLOYEE",    employee: { name: "Vanessa", payType: "PAYROLL" } },
];

// Mostrar lo que vamos a borrar antes de hacerlo (registro para el operador).
const existing = await prisma.user.findMany({
  select: { username: true, role: true },
  orderBy: { username: "asc" },
});
console.log(`\n⚠️  Usuarios actuales en producción (${existing.length}):`);
existing.forEach((u) => console.log(`  · ${u.username.padEnd(20)} ${u.role}`));

// Limpiar dependencias y borrar.
const deletedSubs = await prisma.pushSubscription.deleteMany({});
const deletedUsers = await prisma.user.deleteMany({});
console.log(`\n🗑️  Eliminados ${deletedUsers.count} usuarios y ${deletedSubs.count} push subscriptions.\n`);

// Crear los 6.
for (const u of users) {
  const passwordHash = await bcrypt.hash(u.password, 12);
  let employeeId = null;

  if (u.employee) {
    const existingEmp = await prisma.employee.findFirst({
      where: { tenantId: tenant.id, name: u.employee.name },
    });
    if (existingEmp) {
      await prisma.employee.update({
        where: { id: existingEmp.id },
        data: { active: true, payType: u.employee.payType },
      });
      employeeId = existingEmp.id;
      console.log(`  ↪ Empleado existente reutilizado: ${u.employee.name}`);
    } else {
      const emp = await prisma.employee.create({
        data: {
          tenantId: tenant.id,
          name: u.employee.name,
          payType: u.employee.payType,
          active: true,
        },
      });
      employeeId = emp.id;
      console.log(`  ↪ Empleado creado: ${u.employee.name}`);
    }
  }

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: u.username,
      passwordHash,
      role: u.role,
      employeeId,
    },
  });
  console.log(`✅ ${u.username.padEnd(14)} → ${u.role}`);
}

console.log("\nUsuarios finales en producción:");
const all = await prisma.user.findMany({
  select: { username: true, role: true, employeeId: true },
  orderBy: { username: "asc" },
});
all.forEach((u) =>
  console.log(`  · ${u.username.padEnd(14)} ${u.role.padEnd(12)} ${u.employeeId ?? ""}`)
);

await prisma.$disconnect();
