import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    tenantId: string;
    employeeId?: string | null;
    inventoryAccess: boolean;
    inventoryPermissions?: string[];
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
  }
}
