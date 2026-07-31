import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Copias de trabajo de agentes: no son código del proyecto y ensuciaban el lint.
    ".claude/**",
    // Cliente Prisma generado (output custom): no se edita ni se versiona.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
