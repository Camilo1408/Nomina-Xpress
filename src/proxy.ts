import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (!session && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (pathname.startsWith("/admin") && session?.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/portal/report", req.url));
  }

  if (pathname.startsWith("/portal") && session?.user.role !== "EMPLOYEE") {
    return NextResponse.redirect(new URL("/admin/dashboard", req.url));
  }

  if (pathname === "/login" && session) {
    const redirect =
      session.user.role === "ADMIN" ? "/admin/dashboard" : "/portal/report";
    return NextResponse.redirect(new URL(redirect, req.url));
  }
});

export const config = {
  matcher: ["/((?!_next|api/auth|favicon.ico|uploads).*)"],
};
