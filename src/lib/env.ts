// H11 / CP-52: las variables de entorno se validan al arrancar el servidor.
//
// Sin esto, una variable ausente o mal escrita aparecía como un error 500 en la primera
// petición que la usaba (o no aparecía: un logo que no sube, un push que no llega).
//
// Dos niveles, a propósito:
//   - ERROR: sin la variable la aplicación no puede funcionar (base de datos, secreto de
//     sesión). El servidor se niega a arrancar y el mensaje dice cuál falta.
//   - AVISO: la aplicación funciona, pero algo opcional quedó a medias o es débil. Se
//     escribe en el log y el servidor arranca: un aviso nunca tumba producción.
//
// Los mensajes nombran la variable, nunca su valor.

import { z } from "zod";

const optional = z.string().trim().optional().transform((v) => (v ? v : undefined));

const envSchema = z.object({
  TURSO_DATABASE_URL: z
    .string({ error: "falta: es la URL de la base de datos (file:… o libsql://…)" })
    .trim()
    .min(1, "está vacía: es la URL de la base de datos (file:… o libsql://…)")
    .regex(/^(file:|libsql:\/\/|https?:\/\/|wss?:\/\/)/, "debe empezar por file:, libsql://, https:// o wss://"),
  TURSO_AUTH_TOKEN: optional,
  NEXTAUTH_SECRET: optional,
  AUTH_SECRET: optional,
  NEXTAUTH_URL: optional,
  CLOUDINARY_CLOUD_NAME: optional,
  CLOUDINARY_API_KEY: optional,
  CLOUDINARY_API_SECRET: optional,
  CRON_SECRET: optional,
  AUDIT_RETENTION_MONTHS: optional,
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optional,
  NEXT_PUBLIC_INVENTARIO_APP_URL: optional,
  AUTH_COOKIE_DOMAIN: optional,
  NOMINA_SYNC_SECRET: optional,
});

/** Variables que el esquema conoce; `.env.example` debe documentarlas todas. */
export const ENV_KEYS = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CRON_SECRET",
  "AUDIT_RETENTION_MONTHS",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "NEXT_PUBLIC_INVENTARIO_APP_URL",
  "AUTH_COOKIE_DOMAIN",
  "NOMINA_SYNC_SECRET",
] as const;

type EnvSource = Record<string, string | undefined>;

export interface EnvReport {
  /** Impiden arrancar. */
  errors: string[];
  /** Se registran, pero no impiden arrancar. */
  warnings: string[];
}

const isUrl = (value: string) => {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Revisa el entorno sin efectos: devuelve qué falta y qué quedó a medias. */
export function checkEnv(source: EnvSource, opts: { production: boolean }): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join(".")} ${issue.message}`);
    }
  }

  const get = (key: (typeof ENV_KEYS)[number]) => source[key]?.trim() || undefined;

  // Fuera del esquema: Zod no evalúa las reglas cruzadas si antes falló un campo, y aquí
  // interesa listar todo lo que falta de una sola vez.
  if (!get("NEXTAUTH_SECRET") && !get("AUTH_SECRET")) {
    errors.push("NEXTAUTH_SECRET falta: sin el secreto no se pueden firmar las sesiones");
  }
  if (get("TURSO_DATABASE_URL")?.startsWith("libsql://") && !get("TURSO_AUTH_TOKEN")) {
    errors.push("TURSO_AUTH_TOKEN falta: una base libsql:// de Turso exige su token");
  }

  const secret = get("AUTH_SECRET") ?? get("NEXTAUTH_SECRET");
  if (secret && secret.length < 32) {
    warnings.push("NEXTAUTH_SECRET tiene menos de 32 caracteres: genera uno con `openssl rand -base64 32`");
  }

  const partial = (label: string, keys: Array<(typeof ENV_KEYS)[number]>, effect: string) => {
    const present = keys.filter((k) => get(k));
    if (present.length > 0 && present.length < keys.length) {
      const missing = keys.filter((k) => !get(k));
      warnings.push(`${label} está a medias (falta ${missing.join(", ")}): ${effect}`);
    }
  };
  partial(
    "Cloudinary",
    ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
    "los logos se guardarán en el disco local, que en Vercel no persiste",
  );
  partial(
    "Web Push",
    ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY"],
    "las notificaciones push no se enviarán",
  );

  const months = get("AUDIT_RETENTION_MONTHS");
  if (months !== undefined && !/^[1-9]\d*$/.test(months)) {
    warnings.push("AUDIT_RETENTION_MONTHS no es un entero positivo: se usará el valor por defecto");
  }

  for (const key of ["NEXTAUTH_URL", "NEXT_PUBLIC_INVENTARIO_APP_URL"] as const) {
    const value = get(key);
    if (value !== undefined && !isUrl(value)) {
      warnings.push(`${key} no es una URL http(s) válida`);
    }
  }

  const cookieDomain = get("AUTH_COOKIE_DOMAIN");
  if (cookieDomain !== undefined && !/^\.?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(cookieDomain)) {
    warnings.push("AUTH_COOKIE_DOMAIN no parece un dominio (ejemplo: .midominio.com)");
  }

  if (opts.production) {
    if (!get("CRON_SECRET")) {
      warnings.push("CRON_SECRET no está definida: la purga de auditoría programada responderá 401");
    }
    // En localhost los puertos comparten la cookie: el dominio solo hace falta fuera.
    const inventory = get("NEXT_PUBLIC_INVENTARIO_APP_URL");
    const local = inventory !== undefined && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(inventory);
    if (inventory && !local && !get("AUTH_COOKIE_DOMAIN")) {
      warnings.push(
        "NEXT_PUBLIC_INVENTARIO_APP_URL está definida sin AUTH_COOKIE_DOMAIN: el inventario no verá la sesión",
      );
    }
  }

  return { errors, warnings };
}

/**
 * Valida el entorno al arrancar (lo llama `src/instrumentation.ts`). Con errores lanza una
 * excepción que detiene el servidor; los avisos solo se registran.
 */
export function assertEnv(
  source: EnvSource = process.env,
  opts: { production: boolean } = { production: process.env.NODE_ENV === "production" },
): EnvReport {
  const report = checkEnv(source, opts);
  for (const warning of report.warnings) console.warn(`[env] aviso: ${warning}`);
  if (report.errors.length > 0) {
    throw new Error(
      `Configuración de entorno inválida:\n${report.errors.map((e) => `  - ${e}`).join("\n")}\nRevisa .env.example.`,
    );
  }
  return report;
}
