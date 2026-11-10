// Base SQLite real para las pruebas de integración de las rutas.
//
// IMPORTAR ESTE ARCHIVO ANTES que cualquier módulo que use `@/lib/db`: al cargarse copia
// la base plantilla (vitest.global-setup.ts) a un archivo propio de este archivo de prueba
// y apunta TURSO_DATABASE_URL hacia él. `@/lib/db` lee esa variable al importarse.
//
// Con una base real se prueba lo que un mock no puede: que la ruta filtra por tenant, que
// los permisos salen del usuario guardado y que el estado que queda es el esperado.

import { copyFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const dir = path.resolve(process.cwd(), "node_modules/.cache/nx-test");
const template = path.join(dir, "template.db");
if (!existsSync(template)) {
  throw new Error("Falta la base plantilla de pruebas: revisa `globalSetup` en vitest.config.ts");
}

const file = `test-${randomUUID()}.db`;
copyFileSync(template, path.join(dir, file));

process.env.TURSO_DATABASE_URL = `file:./node_modules/.cache/nx-test/${file}`;
// Un token del entorno del desarrollador nunca debe acompañar a la base de pruebas.
delete process.env.TURSO_AUTH_TOKEN;

export interface TestSession {
  user: { id: string; tenantId: string; role: string; name: string; username: string; employeeId: string | null };
}

/** Petición JSON para llamar un handler de ruta directamente. */
export function jsonRequest(method: string, body?: unknown, url = "http://localhost/api/test") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Petición GET con parámetros de consulta. */
export function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/test");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new Request(url);
}

/** `params` de una ruta dinámica de Next.js 16 (promesa). */
export const routeParams = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

/**
 * Datos mínimos de un cliente: tenant, un usuario por rol base y dos empleados de nómina.
 * Los permisos de cada sesión se resuelven de verdad contra estos usuarios.
 */
export async function seedTenant(label = "a") {
  const { prisma } = await import("@/lib/db");
  const tenant = await prisma.tenant.create({ data: { name: `Restaurante ${label}` } });
  const tenantId = tenant.id;

  const ana = await prisma.employee.create({
    data: { tenantId, name: `Ana ${label}`, hourlyRateNormal: 10_000, hourlyRateSpecial: 15_000 },
  });
  const luis = await prisma.employee.create({
    data: { tenantId, name: `Luis ${label}`, hourlyRateNormal: 8_000, hourlyRateSpecial: 12_000 },
  });

  const mkUser = (username: string, role: string, employeeId?: string) =>
    prisma.user.create({
      data: { tenantId, username: `${username}-${label}`, passwordHash: "x", role, employeeId },
    });
  const users = {
    proprietario: await mkUser("proprietario", "PROPRIETARY"),
    superadmin: await mkUser("superadmin", "SUPERADMIN"),
    admin: await mkUser("admin", "ADMIN"),
    empleado: await mkUser("empleado", "EMPLOYEE", ana.id),
  };

  const sessionOf = (who: keyof typeof users): TestSession => {
    const u = users[who];
    return {
      user: { id: u.id, tenantId, role: u.role, name: u.username, username: u.username, employeeId: u.employeeId },
    };
  };

  return { tenant, tenantId, ana, luis, users, sessionOf };
}

export type SeededTenant = Awaited<ReturnType<typeof seedTenant>>;

/** Deja la base vacía entre pruebas (el orden respeta las claves foráneas). */
export async function resetDb() {
  const { prisma } = await import("@/lib/db");
  const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`,
  );
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  for (const { name } of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${name}"`);
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}
