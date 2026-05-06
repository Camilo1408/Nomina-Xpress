"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { BarChart3, Calendar, LogOut } from "lucide-react";

interface PortalNavProps {
  userName: string;
  logoUrl?: string | null;
}

export function PortalNav({ userName, logoUrl }: PortalNavProps) {
  const pathname = usePathname();

  return (
    <header className="bg-[var(--sidebar)] border-b border-[var(--sidebar-border)] shadow-sm">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain border border-[var(--border)] bg-white" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
                <span className="text-white font-bold text-xs">NX</span>
              </div>
            )}
            <span className="font-heading font-bold text-[var(--foreground)] text-sm hidden sm:block">Nómina Xpress</span>
          </div>
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {[
              { href: "/portal/report", label: "Mi Nómina", icon: BarChart3 },
              { href: "/portal/schedule", label: "Mi Horario", icon: Calendar },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  pathname === href
                    ? "bg-[var(--accent)] text-[var(--primary)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--foreground)]"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="hidden xs:inline sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <span className="text-sm text-[var(--muted-foreground)] hidden sm:block truncate max-w-[120px]">{userName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-red-500 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
}
