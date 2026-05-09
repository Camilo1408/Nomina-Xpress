import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Routes that the restricted ADMIN role cannot access
const SUPERADMIN_ONLY_PATHS = [
  "/admin/dashboard",
  "/admin/employees",
  "/admin/schedules",
  "/admin/settings",
];

// Routes ADMIN can access (explicitly allowed — everything else in /admin is blocked)
// /admin/time-entries, /admin/reports, /admin/profile are allowed for ADMIN

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

  if (pathname.startsWith("/portal") && role !== "EMPLOYEE") {
    return NextResponse.redirect(new URL("/admin/time-entries", req.url));
  }

  if (pathname === "/login" && session) {
    let redirect = "/portal/report";
    if (role === "SUPERADMIN") redirect = "/admin/dashboard";
    else if (role === "ADMIN") redirect = "/admin/time-entries";
    return NextResponse.redirect(new URL(redirect, req.url));
  }
});

export const config = {
  matcher: ["/((?!_next|api/auth|favicon.ico|uploads).*)"],
};
