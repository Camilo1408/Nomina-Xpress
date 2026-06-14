import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";
import { formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const tenantId = session!.user.tenantId;

  // Use Colombia timezone (UTC-5, no DST) so "today" matches the date users enter in forms
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

  const [totalEmployees, todayEntries, pendingCheckout] = await Promise.all([
    prisma.employee.count({ where: { tenantId, active: true } }),
    prisma.timeEntry.findMany({
      where: { tenantId, date: today },
      include: { employee: true },
      orderBy: { checkIn: "desc" },
    }),
    prisma.timeEntry.findMany({
      where: { tenantId, date: today, checkOut: null },
      include: { employee: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Dashboard</h1>
        <p className="text-[#7A6358] text-sm mt-1">
          {new Date().toLocaleDateString("es-CO", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "America/Bogota",
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-[var(--primary)] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Empleados activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground font-mono">{totalEmployees}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[var(--success)] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" /> Registros hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground font-mono">{todayEntries.length}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[var(--warning)] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Sin salida registrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground font-mono">{pendingCheckout.length}</p>
          </CardContent>
        </Card>
      </div>

      {pendingCheckout.length > 0 && (
        <Card className="border-[var(--warning)] bg-[var(--muted)] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[var(--warning)]" />
              Empleados con entrada sin salida hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingCheckout.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium text-foreground min-w-0 break-words">{entry.employee.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-muted-foreground">Entrada: {formatTime(entry.checkIn)}</span>
                    <Link href={`/admin/time-entries/${entry.id}`}>
                      <Badge variant="outline" className="text-[var(--primary)] border-[var(--primary)] cursor-pointer hover:bg-accent">
                        Registrar salida
                      </Badge>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {todayEntries.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">
              Registros de hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todayEntries.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm py-1.5 border-b border-border last:border-0">
                  <span className="font-medium text-foreground min-w-0 break-words">{entry.employee.name}</span>
                  <div className="flex items-center gap-3 text-muted-foreground flex-shrink-0">
                    <span>{formatTime(entry.checkIn)}</span>
                    <span>—</span>
                    <span>{entry.checkOut ? formatTime(entry.checkOut) : "—"}</span>
                    {entry.isSpecial && (
                      <Badge className="bg-accent text-[var(--primary)] border-0 text-xs">
                        Especial
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3" suppressHydrationWarning>
        <Link
          href="/admin/time-entries/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Clock className="w-4 h-4" /> Registrar hora
        </Link>
        <Link
          href="/admin/reports"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors"
        >
          Ver reportes
        </Link>
      </div>
    </div>
  );
}
