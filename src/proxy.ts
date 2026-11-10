import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { NONCE_HEADER, buildCsp, createNonce } from "@/lib/csp";

// El control fino de permisos se hace a nivel de página (Server Components con
// acceso a Prisma), porque el middleware corre en edge runtime y no puede
// resolver permisos efectivos desde la base de datos. Aquí solo se controla el
// acceso por portal según el rol base.

const ADMIN_PORTAL_ROLES = ["ADMIN", "SUPERADMIN", "PROPRIETARY"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const role = session?.user.role;

  if (!session && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // El acceso a /admin NO se decide aquí por rol base: el edge runtime no puede
  // resolver permisos efectivos desde la BD. El gate real está en admin/layout
  // (Server Component con BD fresca), que permite entrar a cualquier usuario con
  // al menos un permiso admin (incluye EMPLOYEE con rol personalizado) y redirige
  // al portal a quien no tenga permisos.

  if (pathname.startsWith("/portal")) {
    if (role !== "EMPLOYEE") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
  }

  if (pathname === "/login" && session) {
    let redirect = "/portal/report";
    if (ADMIN_PORTAL_ROLES.includes(role ?? "")) redirect = "/admin/dashboard";
    return NextResponse.redirect(new URL(redirect, req.url));
  }

  // H10: las rutas de la API responden JSON o archivos; les basta la política sin
  // scripts en línea de next.config.ts.
  if (pathname.startsWith("/api/")) return;

  // Páginas: un nonce nuevo por petición. Va en la petición (Next.js lo toma de ahí para
  // sus scripts y el layout raíz lo lee de `x-nonce`) y en la respuesta (para el navegador).
  const nonce = createNonce();
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV !== "production" });
  const headers = new Headers(req.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
});

export const config = {
  matcher: ["/((?!_next|api/auth|api/cron|api/inventory-permissions/sync|api/inventory-permissions/session|favicon\\.ico|uploads|sw\\.js|manifest\\.json|icon-).*)" ],
};
