import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { recordAudit, getClientInfo } from "@/lib/audit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
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
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.employeeId = user.employeeId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.tenantId = token.tenantId as string;
      session.user.employeeId = token.employeeId as string | null | undefined;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
