import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Routes that the restricted ADMIN role cannot access
// (SUPERADMIN y PROPRIETARY sí pueden)
const SUPERADMIN_ONLY_PATHS = [
  "/admin/employees",
  "/admin/schedules",
  "/admin/settings",
];

const ADMIN_PORTAL_ROLES = ["ADMIN", "SUPERADMIN", "PROPRIETARY"];
const FULL_ADMIN_ROLES = ["SUPERADMIN", "PROPRIETARY"];

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
    if (
      !FULL_ADMIN_ROLES.includes(role ?? "") &&
      SUPERADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p))
    ) {
      return NextResponse.redirect(new URL("/admin/time-entries", req.url));
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
  matcher: ["/((?!_next|api/auth|favicon\\.ico|uploads|sw\\.js|manifest\\.json|icon-).*)" ],
};
