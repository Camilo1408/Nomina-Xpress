"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AUDIT_ACTIONS,
  AUDIT_MODULES,
  ACTION_LABELS,
  MODULE_LABELS,
} from "@/lib/audit-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

export interface AuditLogRow {
  id: string;
  username: string;
  role: string;
  action: string;
  module: string;
  entityId: string | null;
  entityLabel: string | null;
  description: string;
  before: string | null;
  after: string | null;
  ip: string | null;
  userAgent: string | null;
  result: string;
  createdAt: string; // ISO
}

interface Filters {
  user: string;
  action: string;
  module: string;
  result: string;
  from: string;
  to: string;
  q: string;
}

interface AuditUserOption {
  username: string;
  label: string;
}

interface AuditClientProps {
  logs: AuditLogRow[];
  users: AuditUserOption[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  filters: Filters;
}

// Colores por tipo de acción (consistentes con la paleta del sistema)
function actionBadgeClass(action: string): string {
  switch (action) {
    case "CREATE":
      return "bg-[#6B8E6B]/15 text-[#6B8E6B] border-0";
    case "DELETE":
    case "LOGIN_FAILED":
      return "bg-[#B94040]/12 text-[#B94040] border-0";
    case "UPDATE":
    case "PUBLISH":
    case "UNPUBLISH":
      return "bg-[#C1643F]/15 text-[#C1643F] border-0";
    case "PAYMENT":
    case "EXPORT":
      return "bg-[#8B6355]/15 text-[#8B6355] border-0";
    case "LOGIN":
    case "LOGOUT":
    case "ACTIVATE":
    case "DEACTIVATE":
      return "bg-[#7A6358]/12 text-[#7A6358] border-0";
    default:
      return "bg-[#7A6358]/12 text-[#7A6358] border-0";
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  });
}

function prettyJson(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const selectClass =
  "h-9 rounded-md border border-[#E0D5CA] bg-white px-3 text-sm text-[#2C1F15] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1643F]/30";

export function AuditClient({
  logs,
  users,
  total,
  page,
  totalPages,
  pageSize,
  filters,
}: AuditClientProps) {
  const router = useRouter();
  const [form, setForm] = useState<Filters>(filters);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function buildQuery(next: Partial<Filters & { page: number }>): string {
    const merged = { ...form, page: 1, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.user) params.set("user", merged.user);
    if (merged.action) params.set("action", merged.action);
    if (merged.module) params.set("module", merged.module);
    if (merged.result) params.set("result", merged.result);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    if (merged.page && merged.page > 1) params.set("page", String(merged.page));
    return params.toString();
  }

  function applyFilters(e?: React.FormEvent) {
    e?.preventDefault();
    router.push(`/admin/audit?${buildQuery({ page: 1 })}`);
  }

  function clearFilters() {
    const empty: Filters = {
      user: "",
      action: "",
      module: "",
      result: "",
      from: "",
      to: "",
      q: "",
    };
    setForm(empty);
    router.push("/admin/audit");
  }

  function goToPage(p: number) {
    router.push(`/admin/audit?${buildQuery({ page: p })}`);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const fromIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIndex = Math.min(page * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#2C1F15] flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#C1643F]" />
            Auditoría
          </h1>
          <p className="text-sm text-[#7A6358] mt-1">
            Historial inmutable de acciones del sistema · {total} registro
            {total === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <form
        onSubmit={applyFilters}
        className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-4 space-y-3"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7A6358]" />
          <Input
            value={form.q}
            onChange={(e) => setForm({ ...form, q: e.target.value })}
            placeholder="Buscar por descripción, registro afectado o usuario…"
            className="pl-9 border-[#E0D5CA] focus-visible:ring-[#C1643F]/30"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-[#7A6358]">
            Usuario
            <SearchableSelect
              value={form.user}
              onValueChange={(v) => setForm({ ...form, user: v })}
              placeholder="Buscar usuario…"
              emptyOption={{ value: "", label: "Todos" }}
              options={users.map((u) => ({ value: u.username, label: u.label }))}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-[#7A6358]">
            Tipo de acción
            <select
              value={form.action}
              onChange={(e) => setForm({ ...form, action: e.target.value })}
              className={selectClass}
            >
              <option value="">Todas</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-[#7A6358]">
            Módulo
            <select
              value={form.module}
              onChange={(e) => setForm({ ...form, module: e.target.value })}
              className={selectClass}
            >
              <option value="">Todos</option>
              {AUDIT_MODULES.map((m) => (
                <option key={m} value={m}>
                  {MODULE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-[#7A6358]">
            Resultado
            <select
              value={form.result}
              onChange={(e) => setForm({ ...form, result: e.target.value })}
              className={selectClass}
            >
              <option value="">Todos</option>
              <option value="SUCCESS">Exitosa</option>
              <option value="FAILURE">Fallida</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-[#7A6358]">
            Desde
            <input
              type="date"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
              className={selectClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-[#7A6358]">
            Hasta
            <input
              type="date"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              className={selectClass}
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="submit"
            className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] gap-2"
          >
            <Search className="w-4 h-4" /> Filtrar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={clearFilters}
            className="gap-2 border-[#E0D5CA] text-[#7A6358]"
          >
            <RotateCcw className="w-4 h-4" /> Limpiar
          </Button>
        </div>
      </form>

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-[#E0D5CA] bg-[#C1643F]/8">
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15] w-8"></th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Fecha y hora</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Usuario</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Acción</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Módulo</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Descripción</th>
              <th className="text-left px-4 py-3 font-semibold text-[#2C1F15]">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => {
              const isOpen = expanded.has(log.id);
              const beforeJson = prettyJson(log.before);
              const afterJson = prettyJson(log.after);
              const hasDetail = beforeJson || afterJson || log.ip || log.userAgent;
              return (
                <Fragment key={log.id}>
                  <tr
                    onClick={() => hasDetail && toggleExpand(log.id)}
                    className={`border-b border-[#F2EDE6] last:border-0 ${
                      i % 2 === 1 ? "bg-[#F2EDE6]/50" : ""
                    } ${hasDetail ? "cursor-pointer hover:bg-[#C1643F]/5" : ""}`}
                  >
                    <td className="px-4 py-3 text-[#7A6358]">
                      {hasDetail && (
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#2C1F15] font-mono whitespace-nowrap text-xs">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#2C1F15]">@{log.username}</p>
                      <p className="text-xs text-[#7A6358]">{log.role}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={actionBadgeClass(log.action)}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[#7A6358]">
                      {MODULE_LABELS[log.module] ?? log.module}
                    </td>
                    <td className="px-4 py-3 text-[#2C1F15] max-w-[360px]">
                      {log.description}
                      {log.entityLabel && (
                        <span className="block text-xs text-[#7A6358] mt-0.5">
                          {log.entityLabel}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={
                          log.result === "FAILURE"
                            ? "bg-[#B94040]/10 text-[#B94040] border-0"
                            : "bg-[#6B8E6B]/15 text-[#6B8E6B] border-0"
                        }
                      >
                        {log.result === "FAILURE" ? "Fallida" : "Exitosa"}
                      </Badge>
                    </td>
                  </tr>
                  {isOpen && hasDetail && (
                    <tr className="bg-[#FAF7F2] border-b border-[#F2EDE6]">
                      <td></td>
                      <td colSpan={6} className="px-4 py-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {beforeJson && (
                            <div>
                              <p className="text-xs font-semibold text-[#7A6358] mb-1">
                                Datos anteriores
                              </p>
                              <pre className="text-xs bg-white border border-[#E0D5CA] rounded-md p-3 overflow-x-auto font-mono text-[#2C1F15] whitespace-pre-wrap break-words">
                                {beforeJson}
                              </pre>
                            </div>
                          )}
                          {afterJson && (
                            <div>
                              <p className="text-xs font-semibold text-[#7A6358] mb-1">
                                Datos nuevos
                              </p>
                              <pre className="text-xs bg-white border border-[#E0D5CA] rounded-md p-3 overflow-x-auto font-mono text-[#2C1F15] whitespace-pre-wrap break-words">
                                {afterJson}
                              </pre>
                            </div>
                          )}
                        </div>
                        {(log.ip || log.userAgent) && (
                          <div className="mt-3 text-xs text-[#7A6358] space-y-0.5">
                            {log.ip && (
                              <p>
                                <span className="font-semibold">IP:</span> {log.ip}
                              </p>
                            )}
                            {log.userAgent && (
                              <p className="break-words">
                                <span className="font-semibold">Navegador:</span>{" "}
                                {log.userAgent}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#7A6358]">
                  No se encontraron registros de auditoría con los filtros
                  aplicados.
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
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
              className="gap-1 border-[#E0D5CA] text-[#7A6358] disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            <span className="text-sm text-[#2C1F15] font-medium">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
              className="gap-1 border-[#E0D5CA] text-[#7A6358] disabled:opacity-40"
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
