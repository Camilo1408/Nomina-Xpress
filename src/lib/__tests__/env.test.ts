import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ENV_KEYS, assertEnv, checkEnv } from "../env";

const SECRET = "x".repeat(32);
const local = { TURSO_DATABASE_URL: "file:./dev.db", NEXTAUTH_SECRET: SECRET };
const prod = {
  TURSO_DATABASE_URL: "libsql://ejemplo.turso.io",
  TURSO_AUTH_TOKEN: "token",
  NEXTAUTH_SECRET: SECRET,
  NEXTAUTH_URL: "https://nomina.example.com",
  CRON_SECRET: "cron",
};

describe("checkEnv (CP-52)", () => {
  it("un entorno local mínimo no tiene errores ni avisos", () => {
    expect(checkEnv(local, { production: false })).toEqual({ errors: [], warnings: [] });
  });

  it("un entorno de producción completo no tiene errores ni avisos", () => {
    expect(checkEnv(prod, { production: true })).toEqual({ errors: [], warnings: [] });
  });

  it("[NEG] sin la URL de la base es un error que la nombra", () => {
    const { errors } = checkEnv({ NEXTAUTH_SECRET: SECRET }, { production: false });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^TURSO_DATABASE_URL falta/);
  });

  it("[NEG] una URL de base vacía o con otro esquema es un error", () => {
    expect(checkEnv({ ...local, TURSO_DATABASE_URL: "  " }, { production: false }).errors[0]).toMatch(/TURSO_DATABASE_URL/);
    expect(checkEnv({ ...local, TURSO_DATABASE_URL: "postgres://x" }, { production: false }).errors[0]).toMatch(
      /TURSO_DATABASE_URL debe empezar/,
    );
  });

  it("[NEG] sin secreto de sesión es un error; AUTH_SECRET también sirve", () => {
    expect(checkEnv({ TURSO_DATABASE_URL: "file:./dev.db" }, { production: false }).errors[0]).toMatch(/^NEXTAUTH_SECRET falta/);
    expect(checkEnv({ TURSO_DATABASE_URL: "file:./dev.db", AUTH_SECRET: SECRET }, { production: false }).errors).toEqual([]);
  });

  it("[NEG] una base libsql:// sin token es un error; una file: no lo exige", () => {
    const { errors } = checkEnv({ ...prod, TURSO_AUTH_TOKEN: "" }, { production: true });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^TURSO_AUTH_TOKEN falta/);
    expect(checkEnv({ ...local, TURSO_AUTH_TOKEN: "" }, { production: false }).errors).toEqual([]);
  });

  it("[LIM] un secreto de 31 caracteres avisa y uno de 32 no", () => {
    expect(checkEnv({ ...local, NEXTAUTH_SECRET: "x".repeat(31) }, { production: false }).warnings).toHaveLength(1);
    expect(checkEnv({ ...local, NEXTAUTH_SECRET: "x".repeat(32) }, { production: false }).warnings).toEqual([]);
  });

  it("Cloudinary o Web Push a medias avisan y dicen qué falta", () => {
    const cloud = checkEnv({ ...local, CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k" }, { production: false });
    expect(cloud.errors).toEqual([]);
    expect(cloud.warnings[0]).toMatch(/Cloudinary está a medias \(falta CLOUDINARY_API_SECRET\)/);

    const push = checkEnv({ ...local, VAPID_PUBLIC_KEY: "p" }, { production: false });
    expect(push.warnings[0]).toMatch(/Web Push está a medias \(falta VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY\)/);
  });

  it("valores con formato inválido avisan, no bloquean", () => {
    const { errors, warnings } = checkEnv(
      {
        ...local,
        AUDIT_RETENTION_MONTHS: "seis",
        NEXTAUTH_URL: "localhost:3000",
        NEXT_PUBLIC_INVENTARIO_APP_URL: "inventario",
        AUTH_COOKIE_DOMAIN: "https://midominio.com",
      },
      { production: false },
    );
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(4);
  });

  it("en producción avisa si falta CRON_SECRET o si el inventario no tiene dominio de cookie", () => {
    const { errors, warnings } = checkEnv(
      { ...prod, CRON_SECRET: undefined, NEXT_PUBLIC_INVENTARIO_APP_URL: "https://inventario.example.com" },
      { production: true },
    );
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.split(" ")[0])).toEqual(["CRON_SECRET", "NEXT_PUBLIC_INVENTARIO_APP_URL"]);
    // En localhost los puertos comparten la cookie: no hace falta el dominio.
    expect(
      checkEnv({ ...prod, NEXT_PUBLIC_INVENTARIO_APP_URL: "http://localhost:3101" }, { production: true }).warnings,
    ).toEqual([]);
  });

  it("[NEG] ningún mensaje incluye el valor de una variable", () => {
    const secreto = "valor-que-no-debe-salir";
    const report = checkEnv(
      { TURSO_DATABASE_URL: `postgres://${secreto}`, NEXTAUTH_SECRET: secreto, AUTH_COOKIE_DOMAIN: `${secreto}/` },
      { production: true },
    );
    expect([...report.errors, ...report.warnings].join("\n")).not.toContain(secreto);
  });
});

describe("assertEnv", () => {
  it("[NEG] con errores lanza una excepción que lista las variables", () => {
    expect(() => assertEnv({}, { production: true })).toThrow(/TURSO_DATABASE_URL[\s\S]*NEXTAUTH_SECRET/);
  });

  it("con avisos no lanza: los escribe en el log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertEnv({ ...local, NEXTAUTH_SECRET: "corto" }, { production: false })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[env\] aviso: NEXTAUTH_SECRET/));
    warn.mockRestore();
  });
});

describe(".env.example", () => {
  it("documenta todas las variables del esquema", () => {
    const example = readFileSync(path.resolve(__dirname, "../../../.env.example"), "utf8");
    const missing = ENV_KEYS.filter((key) => !new RegExp(`^#?\\s*${key}=`, "m").test(example));
    expect(missing).toEqual([]);
  });
});
