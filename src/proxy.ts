import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Routes that the restricted ADMIN role cannot access
const SUPERADMIN_ONLY_PATHS = [
  "/admin/employees",
  "/admin/schedules",
  "/admin/settings",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const role = session?.user.role;

  if (!session && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Session exists but role is unrecognized — force re-login to avoid redirect loops
  if (session && role !== "ADMIN" && role !== "SUPERADMIN" && role !== "EMPLOYEE") {
    if (pathname !== "/login") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return;
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
    if (role !== "EMPLOYEE") {
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
