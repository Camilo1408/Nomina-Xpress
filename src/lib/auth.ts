import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { recordAudit } from "@/lib/audit";
import { authorizeCredentials } from "@/lib/login";
import { SESSION_MAX_AGE_SECONDS, SESSION_UPDATE_AGE_SECONDS } from "@/lib/session-guard";
import { resolveSessionState } from "@/lib/session-state";

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
  // Sesión corta y renovable (antes: 30 días por defecto) + revocación por
  // sessionVersion en el callback jwt() (RN-19).
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS, updateAge: SESSION_UPDATE_AGE_SECONDS },
  cookies: sharedSessionCookie,
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      // Límite de intentos, bcrypt constante y auditoría: src/lib/login.ts (CP-45, CP-46).
      authorize: (credentials, request) => authorizeCredentials(credentials, request),
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
        token.sv = user.sessionVersion ?? 0;
      }
      if (token.id && token.tenantId) {
        // RN-19: usuario eliminado, desactivado o con la sesión revocada (cambio de
        // contraseña o de rol) ⇒ null invalida la sesión y borra la cookie. La misma
        // función responde a Inventory (POST /api/inventory-permissions/session).
        const state = await resolveSessionState(token.id as string, token.tenantId as string, token.sv);
        if (!state.valid) return null;
        token.role = state.role;
        token.inventoryAccess = state.inventoryAccess;
        token.inventoryPermissions = state.inventoryPermissions;
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
