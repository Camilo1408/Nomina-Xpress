// Se ejecuta una vez al arrancar el servidor (convención de Next.js).
// H11 / CP-52: valida las variables de entorno antes de atender la primera petición.

export async function register() {
  // Solo en el servidor Node: el proxy (runtime edge) no tiene acceso al mismo entorno.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertEnv } = await import("@/lib/env");
  assertEnv();
}
