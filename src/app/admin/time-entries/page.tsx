import { prisma } from "@/lib/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate, formatTime, formatHours } from "@/lib/utils";
import { TimeEntryActions } from "@/components/admin/time-entries/TimeEntryActions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

// Paginación: máximo 20 por página, opciones 10/15/20, por defecto 15.
const PAGE_SIZE_OPTIONS = [10, 15, 20] as const;
const DEFAULT_PAGE_SIZE = 15;

function resolvePageSize(raw?: string): number {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

function calculateHours(checkIn: Date, checkOut: Date | null): string {
  if (!checkOut) return "—";
  const h = Math.max(0, (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60));
  return formatHours(h);
}

export default async function TimeEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; employeeId?: string; page?: string; pageSize?: string }>;
}) {
  const { session, permissions } = await requirePagePermission(PERMISSIONS.TIME_ENTRIES_VIEW);
  const tenantId = session.user.tenantId;
  const canCreate = permissions.has(PERMISSIONS.TIME_ENTRIES_CREATE);
  const canEdit = permissions.has(PERMISSIONS.TIME_ENTRIES_EDIT);
  const canDelete = permissions.has(PERMISSIONS.TIME_ENTRIES_DELETE);
  const sp = await searchParams;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const from = sp.from ?? `${todayYear}-${String(todayMonth).padStart(2, "0")}-01`;
  const to = sp.to ?? today;

  const pageSize = resolvePageSize(sp.pageSize);

  const where = {
    tenantId,
    date: { gte: from, lte: to },
    ...(sp.employeeId ? { employeeId: sp.employeeId } : {}),
  };

  // Contar primero para conocer el total de páginas y validar el parámetro `page`.
  const total = await prisma.timeEntry.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Normaliza páginas inválidas (0, negativas, no numéricas, o mayores al máximo).
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages);

  const [entries, employees] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      select: {
        id: true,
        date: true,
        checkIn: true,
        checkOut: true,
        isSpecial: true,
        employee: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { checkIn: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employee.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const fromIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIndex = Math.min(page * pageSize, total);

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    if (sp.employeeId) params.set("employeeId", sp.employeeId);
    params.set("pageSize", String(pageSize));
    if (p > 1) params.set("page", String(p));
    return `/admin/time-entries?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Registro de Horas</h1>
          <p className="text-sm text-[#7A6358] mt-1">{total} registro{total === 1 ? "" : "s"}</p>
        </div>
        {canCreate && (
          <Link href="/admin/time-entries/new">
            <Button className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-2">
              <Plus className="w-4 h-4" /> Registrar horas
            </Button>
          </Link>
        )}
      </div>

      <form method="GET" className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-3 bg-white rounded-lg border border-[#E0D5CA] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <label className="text-sm text-[#7A6358] font-medium">Desde</label>
          <input type="date" name="from" defaultValue={from} className="border border-[#E0D5CA] rounded-md px-2 py-1.5 text-sm text-[#2C1F15] w-full sm:w-auto" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <label className="text-sm text-[#7A6358] font-medium">Hasta</label>
          <input type="date" name="to" defaultValue={to} className="border border-[#E0D5CA] rounded-md px-2 py-1.5 text-sm text-[#2C1F15] w-full sm:w-auto" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <label className="text-sm text-[#7A6358] font-medium">Personal</label>
          <SearchableSelect
            name="employeeId"
            defaultValue={sp.employeeId ?? ""}
            placeholder="Buscar personal…"
            emptyOption={{ value: "", label: "Todos" }}
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            className="w-full sm:w-56"
          />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <label className="text-sm text-[#7A6358] font-medium">Por página</label>
          <select
            name="pageSize"
            defaultValue={String(pageSize)}
            className="border border-[#E0D5CA] rounded-md px-2 py-1.5 text-sm text-[#2C1F15] w-full sm:w-auto bg-white"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" variant="outline" className="border-[#C1643F] text-[#C1643F] sm:self-end">
          Filtrar
        </Button>
      </form>

      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[#E0D5CA] bg-[#C1643F]/8">
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Personal</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Fecha</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Entrada</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Salida</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Horas</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Tipo</th>
              <th className="text-right px-4 py-3 font-semibold text-[#2C1F15]">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.id} className={`border-b border-[#F2EDE6] last:border-0 ${i % 2 === 1 ? "bg-[#F2EDE6]/50" : ""}`}>
                <td className="px-4 py-3 font-medium text-[#2C1F15]">{entry.employee.name}</td>
                <td className="px-4 py-3 text-[#7A6358] font-mono">{formatDate(entry.date)}</td>
                <td className="px-4 py-3 text-[#2C1F15] font-mono">{formatTime(entry.checkIn)}</td>
                <td className="px-4 py-3 text-[#2C1F15] font-mono">{entry.checkOut ? formatTime(entry.checkOut) : <Badge className="bg-[#D4A843]/10 text-[#D4A843] border-0">Pendiente</Badge>}</td>
                <td className="px-4 py-3 text-[#2C1F15] font-mono">{calculateHours(entry.checkIn, entry.checkOut)}</td>
                <td className="px-4 py-3">
                  <Badge className={entry.isSpecial ? "bg-[#C1643F]/10 text-[#C1643F] border-0" : "bg-[#6B8E6B]/10 text-[#6B8E6B] border-0"}>
                    {entry.isSpecial ? "Especial" : "Normal"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <TimeEntryActions entryId={entry.id} canEdit={canEdit} canDelete={canDelete} />
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#7A6358]">
                  No hay registros en este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#7A6358]">
            Mostrando {fromIndex}–{toIndex} de {total}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)}>
                <Button variant="outline" size="sm" className="gap-1 border-[#E0D5CA] text-[#7A6358]">
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled className="gap-1 border-[#E0D5CA] text-[#7A6358] disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" /> Anterior
              </Button>
            )}
            <span className="text-sm text-[#2C1F15] font-medium">
              {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)}>
                <Button variant="outline" size="sm" className="gap-1 border-[#E0D5CA] text-[#7A6358]">
                  Siguiente <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled className="gap-1 border-[#E0D5CA] text-[#7A6358] disabled:opacity-40">
                Siguiente <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
