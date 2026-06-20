import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, AlertCircle, AlertTriangle, Coins } from "lucide-react";
import Link from "next/link";
import { formatTime } from "@/lib/utils";
import { getSessionPermissions } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const tenantId = session!.user.tenantId;
  const permissions = await getSessionPermissions(session);

  const canViewEmployees = permissions.has(PERMISSIONS.EMPLOYEES_VIEW);
  const canViewTimeEntries = permissions.has(PERMISSIONS.TIME_ENTRIES_VIEW);
  const canEditTimeEntries = permissions.has(PERMISSIONS.TIME_ENTRIES_EDIT);
  const canCreateTimeEntries = permissions.has(PERMISSIONS.TIME_ENTRIES_CREATE);
  const canViewReports = permissions.has(PERMISSIONS.PAYROLL_VIEW);
  const canCreateTips = permissions.has(PERMISSIONS.TIPS_CREATE);

  // Use Colombia timezone (UTC-5, no DST) so "today" matches the date users enter in forms
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

  // Hora actual en Colombia para la alerta de propinas después de las 10 PM
  const nowColombia = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const hourColombia = nowColombia.getHours();
  const isPast10PM = hourColombia >= 22;

  // Fecha de ayer en Colombia
  const yesterdayDate = new Date(nowColombia);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getDate()).padStart(2, "0")}`;

  // Solo se consulta lo que el usuario tiene permiso de ver
  const [totalEmployees, todayEntries, pendingCheckout, historicalPending, tipToday, tipYesterday] = await Promise.all([
    canViewEmployees
      ? prisma.employee.count({ where: { tenantId, active: true } })
      : Promise.resolve(0),
    canViewTimeEntries
      ? prisma.timeEntry.findMany({
          where: { tenantId, date: today },
          include: { employee: true },
          orderBy: { checkIn: "desc" },
        })
      : Promise.resolve([]),
    canViewTimeEntries
      ? prisma.timeEntry.findMany({
          where: { tenantId, date: today, checkOut: null },
          include: { employee: true },
        })
      : Promise.resolve([]),
    // Registros de días ANTERIORES que nunca tuvieron salida registrada
    canViewTimeEntries
      ? prisma.timeEntry.findMany({
          where: {
            tenantId,
            date: { lt: today },
            OR: [
              { checkOut: null },
              { checkIn2: { not: null }, checkOut2: null },
            ],
          },
          include: { employee: true },
          orderBy: [{ date: "desc" }, { checkIn: "desc" }],
        })
      : Promise.resolve([]),
    // Verificar si existen propinas registradas hoy y ayer
    canCreateTips
      ? prisma.tipEntry.findFirst({ where: { tenantId, date: today }, select: { id: true } })
      : Promise.resolve(null),
    canCreateTips
      ? prisma.tipEntry.findFirst({ where: { tenantId, date: yesterday }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  const hasAnyWidget = canViewEmployees || canViewTimeEntries;

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

      {/* Alerta de propinas de ayer no registradas */}
      {canCreateTips && !tipYesterday && (
        <Card className="border border-amber-300 bg-amber-50 shadow-sm">
          <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-sm font-medium text-amber-800">
                No se registraron las propinas del{" "}
                <span className="font-mono">
                  {(() => { const [y, m, d] = yesterday.split("-"); return `${d}/${m}/${y}`; })()}
                </span>
              </span>
            </div>
            <Link
              href="/admin/tips"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors flex-shrink-0"
            >
              <Coins className="w-3.5 h-3.5" /> Registrar propinas
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Alerta de propinas de hoy — solo después de las 10 PM */}
      {canCreateTips && !tipToday && isPast10PM && (
        <Card className="border border-orange-300 bg-orange-50 shadow-sm">
          <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-orange-600 flex-shrink-0" />
              <span className="text-sm font-medium text-orange-800">
                No se han registrado las propinas de hoy —{" "}
                <span className="font-mono">
                  {(() => { const [y, m, d] = today.split("-"); return `${d}/${m}/${y}`; })()}
                </span>
              </span>
            </div>
            <Link
              href="/admin/tips"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium transition-colors flex-shrink-0"
            >
              <Coins className="w-3.5 h-3.5" /> Registrar propinas
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Alerta de registros históricos sin salida — aparece siempre que existan */}
      {canViewTimeEntries && historicalPending.length > 0 && (
        <Card className="border border-red-300 bg-red-50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              {historicalPending.length === 1
                ? "1 registro de días anteriores sin salida registrada"
                : `${historicalPending.length} registros de días anteriores sin salida registrada`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {historicalPending.map((entry) => {
                const [year, month, day] = entry.date.split("-");
                const dateLabel = `${day}/${month}/${year}`;
                const isSecondShiftOpen = entry.checkIn2 && !entry.checkOut2;
                return (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm py-1.5 border-b border-red-200 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-red-900 truncate">{entry.employee.name}</span>
                      <span className="text-red-500 font-mono text-xs flex-shrink-0">{dateLabel}</span>
                      {isSecondShiftOpen && (
                        <span className="text-xs text-red-500 flex-shrink-0">(2.º turno)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-red-600 text-xs">
                        Entrada: {formatTime(isSecondShiftOpen ? entry.checkIn2! : entry.checkIn)}
                      </span>
                      {canEditTimeEntries && (
                        <Link href={`/admin/time-entries/${entry.id}`}>
                          <Badge className="bg-red-600 hover:bg-red-700 text-white border-0 cursor-pointer text-xs">
                            Registrar salida
                          </Badge>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {hasAnyWidget && (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {canViewEmployees && (
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
        )}

        {canViewTimeEntries && (
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
        )}

        {canViewTimeEntries && (
          <Card className={`border-l-4 shadow-sm ${historicalPending.length > 0 ? "border-l-red-500" : "border-l-[var(--warning)]"}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Sin salida registrada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold font-mono ${historicalPending.length > 0 ? "text-red-600" : "text-foreground"}`}>
                {pendingCheckout.length + historicalPending.length}
              </p>
              {historicalPending.length > 0 && (
                <p className="text-xs text-red-500 mt-1">
                  {historicalPending.length} de días anteriores
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      )}

      {canViewTimeEntries && pendingCheckout.length > 0 && (
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
                    {canEditTimeEntries && (
                      <Link href={`/admin/time-entries/${entry.id}`}>
                        <Badge variant="outline" className="text-[var(--primary)] border-[var(--primary)] cursor-pointer hover:bg-accent">
                          Registrar salida
                        </Badge>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {canViewTimeEntries && todayEntries.length > 0 && (
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

      {(canCreateTimeEntries || canViewReports) && (
        <div className="flex gap-3" suppressHydrationWarning>
          {canCreateTimeEntries && (
            <Link
              href="/admin/time-entries/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Clock className="w-4 h-4" /> Registrar hora
            </Link>
          )}
          {canViewReports && (
            <Link
              href="/admin/reports"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors"
            >
              Ver reportes
            </Link>
          )}
        </div>
      )}

      {!hasAnyWidget && !canCreateTimeEntries && !canViewReports && (
        <Card className="shadow-sm">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Usa el menú lateral para acceder a las secciones disponibles según tus permisos.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
