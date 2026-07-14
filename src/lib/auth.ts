import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { recordAudit, getClientInfo } from "@/lib/audit";
import { getEffectivePermissions } from "@/lib/get-permissions";
import { PERMISSIONS, dailyCategoryKeys } from "@/lib/permission-keys";
import { getMirroredCategories } from "@/lib/inventory-sync";

const PRIVILEGED_ROLES = ["PROPRIETARY", "SUPERADMIN", "ADMIN"];

/**
 * Calcula los permisos de inventario efectivos del usuario para transmitirlos
 * en el JWT (el app de inventario los lee y hace enforcing granular).
 *
 * - Roles PROPRIETARY/SUPERADMIN/ADMIN traen todos los permisos estáticos de
 *   inventario por su rol base; un CustomRole puede acotarlos.
 * - Empleados con el toggle `inventoryAccess` reciben el baseline operativo.
 * - Permisos DINÁMICOS por categoría (inventory:daily:<slug>:*):
 *   · roles privilegiados con rol base → TODAS las categorías activas (espejo local)
 *   · cualquier rol/usuario → las claves por categoría que tenga asignadas
 */
async function resolveInventoryPermissions(
  userId: string,
  tenantId: string,
  role: string,
  inventoryAccessFlag: boolean
): Promise<string[]> {
  const effective = await getEffectivePermissions(userId, tenantId);
  const inv = new Set<string>([...effective].filter((k) => k.startsWith("inventory:")));
  if (inventoryAccessFlag) {
    inv.add(PERMISSIONS.INVENTORY_VIEW);
    inv.add(PERMISSIONS.INVENTORY_STOCK_COUNT);
  }

  // ¿El usuario opera con su rol base (sin CustomRole activo)?
  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: { customRole: { select: { active: true, tenantId: true } } },
  });
  const hasActiveCustomRole = !!(u?.customRole && u.customRole.active && u.customRole.tenantId === tenantId);
  const usesBaseRole = role === "PROPRIETARY" || !hasActiveCustomRole;

  // Roles privilegiados con rol base → acceso completo a TODAS las categorías activas.
  if (PRIVILEGED_ROLES.includes(role) && usesBaseRole) {
    const categories = await getMirroredCategories(tenantId);
    for (const cat of categories) {
      for (const key of dailyCategoryKeys(cat.slug)) inv.add(key);
    }
  }

  return [...inv];
}

// Cookie de sesión compartida entre subdominios (modo integrado con Inventory Xpress).
// Cuando AUTH_COOKIE_DOMAIN está definido (p. ej. ".cucinadeifiori.com"), la cookie de
// sesión se emite con ese Domain para que el subdominio del inventario
// (inventario.<dominio>) la lea y valide el JWT con el mismo NEXTAUTH_SECRET. Si no
// está definido (demo/local), NextAuth usa su cookie host-only por defecto y nada
// cambia. El nombre "__Secure-authjs.session-token" es el mismo que NextAuth v5 usa
// por defecto en HTTPS, así que fijarlo aquí solo agrega el Domain.
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN?.trim();
const sharedSessionCookie = AUTH_COOKIE_DOMAIN
  ? {
      sessionToken: {
        // Nombre propio a propósito (no el default "__Secure-authjs.session-token").
        // Durante la transición al dominio de cookie compartido quedaron cookies
        // viejas host-only con el nombre default en los navegadores; usar un nombre
        // distinto hace que la app IGNORE esas cookies viejas (no colisionan por
        // orden de envío), así el login funciona sin que el usuario borre cookies.
        // DEBE ser idéntico en nómina e inventario: es la sal de cifrado del JWT.
        name: "__Secure-nx.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax" as const,
          path: "/",
          secure: true,
          domain: AUTH_COOKIE_DOMAIN,
        },
      },
    }
  : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  cookies: sharedSessionCookie,
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      async authorize(credentials, request) {
        if (!credentials?.username || !credentials?.password) return null;
        const { ip, userAgent } =
          request instanceof Request
            ? getClientInfo(request)
            : { ip: null, userAgent: null };
        const user = await prisma.user.findUnique({
          where: { username: credentials.username as string },
          include: { employee: true },
        });
        // Usuario inexistente: no hay tenant al cual asociar el evento → no se audita.
        if (!user) return null;
        // Usuario desactivado: no puede iniciar sesión
        if (!user.active) {
          await recordAudit({
            tenantId: user.tenantId,
            userId: user.id,
            username: user.username,
            role: user.role,
            action: "LOGIN_FAILED",
            module: "AUTH",
            description: `Intento de inicio de sesión de usuario desactivado @${user.username}`,
            ip,
            userAgent,
            result: "FAILURE",
          });
          return null;
        }
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) {
          // Intento fallido sobre un usuario real: se audita en su tenant.
          await recordAudit({
            tenantId: user.tenantId,
            userId: user.id,
            username: user.username,
            role: user.role,
            action: "LOGIN_FAILED",
            module: "AUTH",
            description: `Intento de inicio de sesión fallido (contraseña incorrecta) de @${user.username}`,
            ip,
            userAgent,
            result: "FAILURE",
          });
          return null;
        }
        await recordAudit({
          tenantId: user.tenantId,
          userId: user.id,
          username: user.username,
          role: user.role,
          action: "LOGIN",
          module: "AUTH",
          description: `@${user.username} inició sesión`,
          ip,
          userAgent,
        });
        return {
          id: user.id,
          name: user.username,
          email: null,          // NextAuth requires this field even if unused
          role: user.role,
          tenantId: user.tenantId,
          employeeId: user.employeeId,
        };
      },
    }),
  ],
  events: {
    // Cierre de sesión. Con estrategia JWT recibimos el token (sin IP disponible).
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (!token?.tenantId || !token?.id) return;
      await recordAudit({
        tenantId: token.tenantId as string,
        userId: token.id as string,
        username: (token.name as string) ?? "—",
        role: (token.role as string) ?? "—",
        action: "LOGOUT",
        module: "AUTH",
        description: `@${token.name ?? "usuario"} cerró sesión`,
      });
    },
  },
  callbacks: {
    // Se ejecuta en cada request (no solo al iniciar sesión). Los permisos de
    // inventario se RECALCULAN siempre desde la DB, así que un cambio hecho por
    // un admin (rol, permiso individual, o el toggle "Acceso a Inventario")
    // surte efecto de inmediato sin exigir que el usuario vuelva a iniciar
    // sesión — antes solo se calculaban una vez al hacer login y quedaban
    // "congelados" en el JWT hasta el próximo login.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.employeeId = user.employeeId;
      }
      if (token.id && token.tenantId) {
        const dbUser = await prisma.user.findFirst({
          where: { id: token.id as string, tenantId: token.tenantId as string },
          select: { role: true, inventoryAccess: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          const inventoryPermissions = await resolveInventoryPermissions(
            token.id as string,
            token.tenantId as string,
            dbUser.role,
            dbUser.inventoryAccess
          );
          token.inventoryAccess = inventoryPermissions.length > 0;
          token.inventoryPermissions = inventoryPermissions;
        }
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.tenantId = token.tenantId as string;
      session.user.employeeId = token.employeeId as string | null | undefined;
      session.user.inventoryAccess = (token.inventoryAccess as boolean) ?? false;
      session.user.inventoryPermissions = (token.inventoryPermissions as string[]) ?? [];
      return session;
    },
  },
  pages: { signIn: "/login" },
});
