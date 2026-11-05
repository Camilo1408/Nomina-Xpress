// Revocación de sesiones JWT (RN-19, Plan de Calidad v3.2).
//
// Con sesiones JWT no hay una tabla de sesiones que borrar: el token vive en la
// cookie del navegador. Para poder revocarlo, cada usuario tiene un contador
// `sessionVersion`; el token guarda la versión vigente al iniciar sesión (`sv`) y
// el callback jwt() de auth.ts la compara con la de la BD en cada request.
//
// Se incrementa al desactivar el usuario, al cambiar su contraseña o su rol: todas
// las sesiones abiertas (en cualquier dispositivo) dejan de valer en su siguiente
// request. Un usuario desactivado o eliminado tampoco pasa, sin importar la versión.

/** Duración máxima de una sesión sin actividad (antes: 30 días por defecto). */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
/** Cada cuánto se re-firma el JWT para extender la sesión activa. */
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60;

export type SessionUserState = { active: boolean; sessionVersion: number } | null | undefined;

/**
 * ¿El token sigue siendo válido para este usuario?
 * Un token emitido antes de existir `sessionVersion` (sin `sv`) cuenta como 0, de
 * modo que el despliegue no cierra la sesión de nadie hasta la primera revocación.
 */
export function isTokenStillValid(tokenVersion: unknown, user: SessionUserState): boolean {
  if (!user || !user.active) return false;
  if (tokenVersion !== undefined && typeof tokenVersion !== "number") return false;
  return (tokenVersion ?? 0) === user.sessionVersion;
}

/** Fragmento de `data` para un `prisma.user.update` que revoca las sesiones. */
export function sessionRevocationData() {
  return { sessionVersion: { increment: 1 } } as const;
}
