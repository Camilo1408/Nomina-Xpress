import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // En producción (Turso libsql) el authToken va en la URL para que
    // prisma migrate deploy pueda autenticarse durante el build de Vercel.
    // En local TURSO_AUTH_TOKEN no está definido y TURSO_DATABASE_URL es file:// .
    url: process.env.TURSO_AUTH_TOKEN
      ? `${process.env.TURSO_DATABASE_URL}?authToken=${process.env.TURSO_AUTH_TOKEN}`
      : (process.env.TURSO_DATABASE_URL ?? "file:./dev.db"),
  },
});
