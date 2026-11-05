import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    tenantId: string;
    employeeId?: string | null;
    // Calculados en el callback jwt() en cada request, no en authorize().
    inventoryAccess?: boolean;
    inventoryPermissions?: string[];
    // Versión de sesión vigente al iniciar sesión (RN-19).
    sessionVersion?: number;
  }
  interface Session {
    user: {
      role: string;
      tenantId: string;
      employeeId?: string | null;
      inventoryAccess: boolean;
      inventoryPermissions: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    tenantId: string;
    employeeId?: string | null;
    inventoryAccess: boolean;
    inventoryPermissions?: string[];
    /** sessionVersion del usuario al emitir el token (RN-19). */
    sv?: number;
  }
}
