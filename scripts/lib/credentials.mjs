// Credenciales para scripts operativos — NUNCA en el código fuente.
//
// Regla (Plan de Calidad, compuerta G6 / métrica M-09): ninguna contraseña real
// se versiona. Los scripts que crean o reinician usuarios toman la contraseña de
// una variable de entorno por usuario y, si no existe, generan una aleatoria y la
// muestran UNA sola vez en la consola del operador.
//
//   NX_PASSWORD_<USUARIO>   p. ej. NX_PASSWORD_SADMINJAVIER="..."
//
// Los scripts E2E o de capturas que inician sesión usan pares usuario/clave por
// variable de entorno. Solo contra un servidor local se permite caer a las
// credenciales de la semilla local (prisma/seed-local.ts), que son datos de prueba.

import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%*-_";
const MIN_LENGTH = 10;

/** Contraseña aleatoria criptográficamente segura (sin caracteres ambiguos). */
export function generatePassword(length = 16) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function passwordEnvKey(username) {
  return `NX_PASSWORD_${String(username).replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
}

const generated = [];

/**
 * Contraseña para `username`: la de NX_PASSWORD_<USUARIO> si existe (mín. 10
 * caracteres) o una generada al azar, que queda registrada para
 * printGeneratedPasswords().
 */
export function passwordFor(username) {
  const key = passwordEnvKey(username);
  const fromEnv = process.env[key]?.trim();
  if (fromEnv) {
    if (fromEnv.length < MIN_LENGTH) {
      throw new Error(`${key} debe tener al menos ${MIN_LENGTH} caracteres`);
    }
    return fromEnv;
  }
  const pwd = generatePassword();
  generated.push({ username, password: pwd });
  return pwd;
}

/** Muestra en consola (una sola vez) las contraseñas generadas en esta ejecución. */
export function printGeneratedPasswords() {
  if (generated.length === 0) return;
  console.log("\n🔐 Contraseñas GENERADAS en esta ejecución (no se guardan en ningún archivo).");
  console.log("   Entrégalas por un canal seguro y pide cambiarlas en el primer ingreso:\n");
  for (const g of generated) console.log(`   · ${g.username.padEnd(16)} ${g.password}`);
  console.log("");
}

/** Lee una variable obligatoria o termina el proceso con un mensaje claro. */
export function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`❌ Falta la variable de entorno ${name}`);
    process.exit(1);
  }
  return v;
}

export function isLocalUrl(url) {
  try {
    const { hostname } = new URL(url);
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname) || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

/**
 * Usuario/clave para iniciar sesión desde un script de pruebas.
 * Usa <PREFIX>_USER y <PREFIX>_PASS; si faltan y el destino es local, cae a la
 * credencial de la semilla local (`fallback`). Contra un destino remoto exige
 * las variables.
 */
export function loginCredentials(prefix, baseUrl, fallback) {
  const user = process.env[`${prefix}_USER`]?.trim();
  const pass = process.env[`${prefix}_PASS`]?.trim();
  if (user && pass) return { user, pass };
  if (fallback && isLocalUrl(baseUrl)) return fallback;
  console.error(`❌ Define ${prefix}_USER y ${prefix}_PASS para ejecutar contra ${baseUrl}`);
  process.exit(1);
}
