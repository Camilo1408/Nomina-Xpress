"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  PERMISSION_GROUPS,
  permissionLabel,
  BASE_ROLE_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  dailyCategoryKeys,
  parseDailyCategoryKey,
  DAILY_ACTION_DESCRIPTIONS,
} from "@/lib/permission-keys";
import { isInventoryEnabled } from "@/lib/feature-flags";
import { InventoryDailyActionsLegend } from "@/components/admin/InventoryDailyActionsLegend";

// Tooltip de ayuda para las claves dinámicas de inventario diario por categoría.
// Para las claves estáticas devuelve undefined (sin tooltip).
function dailyActionTooltip(key: string): string | undefined {
  const parsed = parseDailyCategoryKey(key);
  return parsed ? DAILY_ACTION_DESCRIPTIONS[parsed.action] : undefined;
}

interface UserPermission {
  permissionKey: string;
  granted: boolean;
}

interface Props {
  userId: string;
  username: string;
  baseRole: string;
  customRolePermissions: string[] | null;
  currentOverrides: UserPermission[];
  customRoles: { id: string; name: string; active: boolean }[];
  currentCustomRoleId: string | null;
  // Categorías de inventario (espejo sincronizado) para permisos por categoría.
  dailyCategories?: { slug: string; name: string }[];
}

export function UserPermissionsForm({
  userId,
  baseRole,
  customRolePermissions,
  currentOverrides,
  customRoles,
  currentCustomRoleId,
  dailyCategories = [],
}: Props) {
  const router = useRouter();

  // Mapa slug→nombre, claves dinámicas por categoría y grupos aumentados.
  const nameBySlug = new Map(dailyCategories.map((c) => [c.slug, c.name]));
  const dailyKeys = dailyCategories.flatMap((c) => dailyCategoryKeys(c.slug));
  const visibleGroups = PERMISSION_GROUPS.filter(
    (g) => isInventoryEnabled() || g.module !== "inventory"
  );
  const groups = visibleGroups.map((g) =>
    g.module === "inventory" ? { ...g, keys: [...g.keys, ...dailyKeys] } : g
  );

  // Las "effective" son las perms del rol (base o personalizado)
  const rolePerms: Set<string> = customRolePermissions
    ? new Set(customRolePermissions)
    : new Set(BASE_ROLE_PERMISSIONS[baseRole] ?? []);

  // Overrides actuales indexados
  const overrideMap = new Map<string, boolean>(
    currentOverrides.map((o) => [o.permissionKey, o.granted])
  );

  // Estado local de overrides (las que el admin está editando)
  // null = sin override (hereda del rol)
  // true = grant adicional
  // false = deny explícito
  const [overrides, setOverrides] = useState<Map<string, boolean | null>>(() => {
    const m = new Map<string, boolean | null>();
    for (const key of [...ALL_PERMISSION_KEYS, ...dailyKeys]) {
      m.set(key, overrideMap.has(key) ? overrideMap.get(key)! : null);
    }
    return m;
  });

  const [selectedRoleId, setSelectedRoleId] = useState(currentCustomRoleId ?? "");
  const [loading, setLoading] = useState(false);

  function setOverride(key: string, state: boolean | null) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, state);
      return next;
    });
  }

  async function saveRole() {
    setLoading(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customRoleId: selectedRoleId || null }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Rol personalizado actualizado");
      router.refresh();
    } else {
      toast.error("Error al actualizar el rol");
    }
  }

  async function saveOverrides() {
    setLoading(true);

    const entries: { permissionKey: string; granted: boolean }[] = [];
    for (const [key, val] of overrides.entries()) {
      if (val !== null) entries.push({ permissionKey: key, granted: val });
    }

    // Primero limpiar todos los overrides del usuario
    await fetch(`/api/admin/users/${userId}/permissions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // Luego guardar los nuevos
    if (entries.length > 0) {
      const res = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: entries }),
      });
      if (!res.ok) {
        setLoading(false);
        toast.error("Error al guardar overrides");
        return;
      }
    }

    setLoading(false);
    toast.success("Permisos individuales guardados");
    router.refresh();
  }

  const overrideCount = [...overrides.values()].filter((v) => v !== null).length;

  return (
    <div className="space-y-6">
      {/* Rol personalizado */}
      <div className="bg-white rounded-lg border border-[#E0D5CA] p-4">
        <h3 className="text-sm font-semibold text-[#2C1F15] mb-3">Rol personalizado</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <select
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              className="w-full rounded-md border border-[#E0D5CA] bg-white px-3 py-2 text-sm text-[#2C1F15] focus:outline-none focus:ring-2 focus:ring-[#C1643F]/30"
            >
              <option value="">(ninguno — usar permisos del rol base {baseRole})</option>
              {customRoles.map((r) => (
                <option key={r.id} value={r.id} disabled={!r.active}>
                  {r.name}{!r.active ? " (inactivo)" : ""}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={saveRole}
            disabled={loading}
            className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]"
          >
            Guardar rol
          </Button>
        </div>
      </div>

      {/* Matriz de permisos efectivos + overrides */}
      <div className="bg-white rounded-lg border border-[#E0D5CA] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#2C1F15]">
            Permisos individuales
            {overrideCount > 0 && (
              <span className="ml-2 text-[#C1643F]">({overrideCount} override{overrideCount !== 1 ? "s" : ""})</span>
            )}
          </h3>
          <p className="text-xs text-[#7A6358]">
            Verde = heredado · Naranja = concedido · Rojo = denegado
          </p>
        </div>

        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.module} className="rounded-lg border border-[#E0D5CA] overflow-hidden">
              <div className="px-4 py-2 bg-[#F2EDE6]/60 border-b border-[#E0D5CA]">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#7A6358]">
                  {group.label}
                </p>
              </div>
              <div className="divide-y divide-[#F2EDE6]">
                {group.keys.map((key) => {
                  const ov = overrides.get(key);
                  const fromRole = rolePerms.has(key);
                  return (
                    <div
                      key={key}
                      title={dailyActionTooltip(key)}
                      className="flex items-center justify-between px-4 py-2.5 gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            ov === true
                              ? "bg-[#C1643F]"
                              : ov === false
                              ? "bg-[#B94040]"
                              : fromRole
                              ? "bg-[#6B8E6B]"
                              : "bg-[#E0D5CA]"
                          }`}
                        />
                        <span className="text-sm text-[#2C1F15]">
                          {permissionLabel(key, nameBySlug)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          title="Sin override (heredar del rol)"
                          onClick={() => setOverride(key, null)}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${
                            ov === null
                              ? "bg-[#E0D5CA] text-[#2C1F15] font-semibold"
                              : "text-[#7A6358] hover:bg-[#F2EDE6]"
                          }`}
                        >
                          Auto
                        </button>
                        <button
                          title="Conceder siempre"
                          onClick={() => setOverride(key, true)}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${
                            ov === true
                              ? "bg-[#C1643F] text-white font-semibold"
                              : "text-[#7A6358] hover:bg-[#F2EDE6]"
                          }`}
                        >
                          Sí
                        </button>
                        <button
                          title="Denegar siempre"
                          onClick={() => setOverride(key, false)}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${
                            ov === false
                              ? "bg-[#B94040] text-white font-semibold"
                              : "text-[#7A6358] hover:bg-[#F2EDE6]"
                          }`}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Leyenda de las 5 acciones diarias (solo si hay categorías sincronizadas) */}
              {group.module === "inventory" && dailyCategories.length > 0 && (
                <InventoryDailyActionsLegend />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-4">
          <Button
            onClick={saveOverrides}
            disabled={loading}
            className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]"
          >
            {loading ? "Guardando..." : "Guardar permisos individuales"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/usuarios")}
            className="border-[#E0D5CA]"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
