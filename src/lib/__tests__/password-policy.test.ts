// H3: las contraseñas nuevas exigen al menos 10 caracteres.

import { describe, it, expect } from "vitest";
import { PASSWORD_MIN_LENGTH, newPasswordSchema } from "@/lib/password-policy";

describe("[CP-45] política de contraseñas", () => {
  it("el mínimo es 10 caracteres", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
  });

  it("[LIM] acepta exactamente 10 y rechaza 9", () => {
    expect(newPasswordSchema.safeParse("a".repeat(10)).success).toBe(true);
    const nine = newPasswordSchema.safeParse("a".repeat(9));
    expect(nine.success).toBe(false);
    expect(nine.error?.issues[0].message).toMatch(/10 caracteres/);
  });
});
