"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Clock,
  Calendar,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  UserCircle,
} from "lucide-react";

const allNavItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, superadminOnly: true },
  { href: "/admin/employees", label: "Empleados", icon: Users, superadminOnly: true },
  { href: "/admin/time-entries", label: "Registro de Horas", icon: Clock, superadminOnly: false },
  { href: "/admin/schedules", label: "Horarios", icon: Calendar, superadminOnly: true },
  { href: "/admin/reports", label: "Reportes", icon: BarChart3, superadminOnly: false },
  { href: "/admin/settings", label: "Configuración", icon: Settings, superadminOnly: true },
];

interface AdminSidebarProps {
  tenantName: string;
  logoUrl?: string | null;
  role: string;
}

export function AdminSidebar({ tenantName, logoUrl, role }: AdminSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isSuperAdmin = role === "SUPERADMIN";
  const navItems = allNavItems.filter((item) => isSuperAdmin || !item.superadminOnly);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[var(--sidebar)] border-b border-[var(--sidebar-border)] flex items-center px-4 gap-3 shadow-sm">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-md hover:bg-[var(--sidebar-accent)] transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5 text-[#2C1F15]" />
        </button>
        <div className="flex items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo"
              className="w-7 h-7 rounded object-contain border border-[var(--border)] bg-white"
            />
          ) : (
            <div className="w-7 h-7 rounded bg-[var(--primary)] flex items-center justify-center">
              <span className="text-white font-bold text-xs font-heading">NX</span>
            </div>
          )}
          <span className="font-heading font-bold text-[#2C1F15] text-sm truncate max-w-[160px]">
            {tenantName}
          </span>
        </div>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "w-60 flex-shrink-0 bg-[var(--sidebar)] border-r border-[var(--sidebar-border)] flex flex-col",
          "fixed inset-y-0 left-0 z-50 h-full transition-transform duration-200",
          "lg:static lg:h-screen lg:sticky lg:top-0 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b border-[var(--sidebar-border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo"
                className="w-9 h-9 rounded-lg object-contain border border-[var(--border)] bg-white flex-shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--primary)]">
                <span className="text-white font-bold text-sm font-heading">NX</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-[var(--muted-foreground)] font-medium">Nómina Xpress</p>
              <p className="text-sm font-semibold text-[var(--sidebar-foreground)] truncate">{tenantName}</p>
            </div>
          </div>
          <button
            className="lg:hidden p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--accent)] text-[var(--primary)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-4 pt-3 border-t border-[var(--sidebar-border)] space-y-0.5">
          <Link
            href="/admin/profile"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
              pathname === "/admin/profile"
                ? "bg-[var(--accent)] text-[var(--primary)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]"
            )}
          >
            <UserCircle className="w-4 h-4 flex-shrink-0" />
            Mi Perfil
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-[var(--muted-foreground)] hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
