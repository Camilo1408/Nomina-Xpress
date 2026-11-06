import { z } from "zod";

/**
 * Política de contraseñas (hallazgo H3 del Plan de Calidad). Aplica a las
 * contraseñas NUEVAS: las existentes de menos de 10 caracteres siguen sirviendo
 * para entrar hasta que su dueño o un administrador las cambie.
 */
export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_MIN_MESSAGE = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;

export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_MIN_MESSAGE);

/**
 * Roles que pueden recuperar el acceso de otro usuario: desbloquear su inicio de
 * sesión y restablecerle la contraseña desde Usuarios del portal (CP-45).
 */
export const ACCESS_RECOVERY_ROLES: readonly string[] = ["PROPRIETARY", "SUPERADMIN"];

export function canRecoverAccess(role: string | undefined | null): boolean {
  return !!role && ACCESS_RECOVERY_ROLES.includes(role);
}
