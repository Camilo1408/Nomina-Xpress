"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PERMISSION_GROUPS,
  permissionLabel,
  isValidPermissionKey,
  dailyCategoryKeys,
} from "@/lib/permission-keys";
import { isInventoryEnabled } from "@/lib/inventory-config";

interface RoleFormProps {
  role?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    permissions: string;
    active: boolean;
    isSystem: boolean;
  };
  // Categorías de inventario (espejo sincronizado) para los permisos por categoría.
  dailyCategories?: { slug: string; name: string }[];
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function RoleForm({ role, dailyCategories = [] }: RoleFormProps) {
  const router = useRouter();
  const isEdit = !!role;

  const initialPerms: Set<string> = new Set(
    isEdit ? (JSON.parse(role!.permissions) as string[]).filter((k) => isValidPermissionKey(k)) : []
  );

  const [name, setName] = useState(role?.name ?? "");
  const [slug, setSlug] = useState(role?.slug ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<Set<string>>(initialPerms);
  const [loading, setLoading] = useState(false);
  const [autoSlug, setAutoSlug] = useState(!isEdit);

  // Mapa slug→nombre y claves dinámicas por categoría, inyectadas en el grupo "Inventario".
  const nameBySlug = new Map(dailyCategories.map((c) => [c.slug, c.name]));
  const dailyKeys = dailyCategories.flatMap((c) => dailyCategoryKeys(c.slug));
  const visibleGroups = PERMISSION_GROUPS.filter(
    (g) => isInventoryEnabled() || g.module !== "inventory"
  );
  const groups = visibleGroups.map((g) =>
    g.module === "inventory" ? { ...g, keys: [...g.keys, ...dailyKeys] } : g
  );

  function togglePerm(key: string) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(keys: string[]) {
    const allOn = keys.every((k) => perms.has(k));
    setPerms((prev) => {
      const next = new Set(prev);
      if (allOn) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast.error("Nombre y slug son obligatorios");
      return;
    }
    setLoading(true);

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      permissions: [...perms],
    };

    const url = isEdit ? `/api/admin/roles/${role!.id}` : "/api/admin/roles";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = typeof data.error === "string" ? data.error : data.error?.message ?? "Error al guardar";
      toast.error(msg);
      return;
    }

    toast.success(isEdit ? "Rol actualizado" : "Rol creado");
    router.push("/admin/roles");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Nombre */}
      <div className="space-y-1.5">
        <Label>Nombre del rol *</Label>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (autoSlug) setSlug(slugify(e.target.value));
          }}
          placeholder="Ej: Supervisor de turno"
          required
        />
      </div>

      {/* Slug */}
      <div className="space-y-1.5">
        <Label>Identificador (slug) *</Label>
        <Input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setAutoSlug(false);
          }}
          placeholder="supervisor-de-turno"
          pattern="[a-z0-9-]+"
          title="Solo letras minúsculas, números y guiones"
          required
          disabled={isEdit}
        />
        <p className="text-xs text-[#7A6358]">
          Identificador único, no se puede cambiar después de crear.
        </p>
      </div>

      {/* Descripción */}
      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ej: Puede ver y registrar horas, pero no editar empleados"
        />
      </div>

      {/* Matriz de permisos */}
      <div>
        <h3 className="text-sm font-semibold text-[#2C1F15] mb-3">
          Permisos ({perms.size} seleccionados)
        </h3>
        <div className="space-y-4">
          {groups.map((group) => {
            const allOn = group.keys.every((k) => perms.has(k));
            const someOn = group.keys.some((k) => perms.has(k));
            return (
              <div
                key={group.module}
                className="bg-white rounded-lg border border-[#E0D5CA] overflow-hidden"
              >
                {/* Cabecera del grupo */}
                <div className="flex items-center gap-3 px-4 py-2.5 bg-[#F2EDE6]/60 border-b border-[#E0D5CA]">
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = someOn && !allOn;
                    }}
                    onChange={() => toggleGroup(group.keys)}
                    className="accent-[#C1643F] w-4 h-4 cursor-pointer"
                    id={`group-${group.module}`}
                  />
                  <label
                    htmlFor={`group-${group.module}`}
                    className="text-xs font-semibold uppercase tracking-wider text-[#7A6358] cursor-pointer select-none"
                  >
                    {group.label}
                  </label>
                </div>
                {/* Permisos del grupo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y divide-[#F2EDE6] sm:divide-y-0">
                  {group.keys.map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#FAF7F2] transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={perms.has(key)}
                        onChange={() => togglePerm(key)}
                        className="accent-[#C1643F] w-4 h-4 flex-shrink-0"
                      />
                      <span className="text-sm text-[#2C1F15]">
                        {permissionLabel(key, nameBySlug)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={loading}
          className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]"
        >
          {loading ? "Guardando..." : isEdit ? "Actualizar rol" : "Crear rol"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/roles")}
          className="border-[#E0D5CA]"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
