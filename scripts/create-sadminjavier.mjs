import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
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
  console.error("No tenant found");
  process.exit(1);
}

const passwordHash = await bcrypt.hash("Javier123", 12);
const existing = await prisma.user.findUnique({ where: { username: "SadminJavier" } });
if (existing) {
  await prisma.user.update({
    where: { id: existing.id },
    data: { role: "PROPRIETARY", passwordHash, tenantId: tenant.id },
  });
  console.log("✅ Usuario SadminJavier actualizado → rol PROPRIETARY");
} else {
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "SadminJavier",
      passwordHash,
      role: "PROPRIETARY",
    },
  });
  console.log("✅ Usuario SadminJavier creado con rol PROPRIETARY");
}
await prisma.$disconnect();
