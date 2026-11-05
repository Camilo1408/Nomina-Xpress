// RN-19: desactivar un usuario, cambiar su contraseña o su rol revoca sus
// sesiones abiertas (Plan de Calidad v3.2, casos CP-43 y CP-44).

import { describe, it, expect } from "vitest";
import {
  isTokenStillValid,
  sessionRevocationData,
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "../session-guard";

const ACTIVE = { active: true, sessionVersion: 3 };

describe("isTokenStillValid", () => {
  it("[RN-19] token con la misma versión de un usuario activo sigue vigente", () => {
    expect(isTokenStillValid(3, ACTIVE)).toBe(true);
  });

  it("[RN-19][NEG][CP-43] usuario desactivado ⇒ sesión inválida aunque la versión coincida", () => {
    expect(isTokenStillValid(3, { active: false, sessionVersion: 3 })).toBe(false);
  });

  it("[RN-19][NEG] usuario eliminado (null) ⇒ sesión inválida", () => {
    expect(isTokenStillValid(3, null)).toBe(false);
  });

  it("[RN-19][NEG][CP-44] versión anterior (clave o rol cambiados) ⇒ sesión inválida", () => {
    expect(isTokenStillValid(2, ACTIVE)).toBe(false);
  });

  it("[RN-19][LIM] token emitido antes de la migración (sin versión) vale como 0", () => {
    expect(isTokenStillValid(undefined, { active: true, sessionVersion: 0 })).toBe(true);
  });

  it("[RN-19][LIM][NEG] token sin versión frente a un usuario ya revocado una vez ⇒ inválido", () => {
    expect(isTokenStillValid(undefined, { active: true, sessionVersion: 1 })).toBe(false);
  });

  it("[RN-19][NEG] una versión manipulada que no es número no se acepta", () => {
    expect(isTokenStillValid("3", ACTIVE)).toBe(false);
  });
});

describe("sessionRevocationData", () => {
  it("[RN-19] incrementa sessionVersion en 1 (escritura atómica de Prisma)", () => {
    expect(sessionRevocationData()).toEqual({ sessionVersion: { increment: 1 } });
  });
});

describe("duración de la sesión", () => {
  it("[LIM] la sesión expira a las 12 h sin uso y se renueva como máximo cada hora", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(12 * 60 * 60);
    expect(SESSION_UPDATE_AGE_SECONDS).toBe(60 * 60);
  });
});
