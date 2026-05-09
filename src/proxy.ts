import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Routes that the restricted ADMIN role cannot access
const SUPERADMIN_ONLY_PATHS = [
  "/admin/employees",
  "/admin/schedules",
  "/admin/settings",
];

// Portal routes ADMIN can also access (to view their own quincena and horario)
const ADMIN_ALLOWED_PORTAL = ["/portal/report", "/portal/schedule"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const role = session?.user.role;

  if (!session && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (pathname.startsWith("/admin")) {
    if (role !== "ADMIN" && role !== "SUPERADMIN") {
      return NextResponse.redirect(new URL("/portal/report", req.url));
    }
    if (role === "ADMIN" && SUPERADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/admin/time-entries", req.url));
    }
  }

  if (pathname.startsWith("/portal")) {
    const adminCanAccess = role === "ADMIN" && ADMIN_ALLOWED_PORTAL.some((p) => pathname.startsWith(p));
    if (role !== "EMPLOYEE" && !adminCanAccess) {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
  }

  if (pathname === "/login" && session) {
    let redirect = "/portal/report";
    if (role === "SUPERADMIN" || role === "ADMIN") redirect = "/admin/dashboard";
    return NextResponse.redirect(new URL(redirect, req.url));
  }
});

export const config = {
  matcher: ["/((?!_next|api/auth|favicon.ico|uploads).*)"],
};
