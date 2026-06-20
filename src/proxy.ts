import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

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

  if (pathname.startsWith("/admin")) {
    if (!ADMIN_PORTAL_ROLES.includes(role ?? "")) {
      return NextResponse.redirect(new URL("/portal/report", req.url));
    }
  }

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
});

export const config = {
  matcher: ["/((?!_next|api/auth|api/cron|favicon\\.ico|uploads|sw\\.js|manifest\\.json|icon-).*)" ],
};
