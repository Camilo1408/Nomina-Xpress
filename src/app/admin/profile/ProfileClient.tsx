"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Package, ExternalLink } from "lucide-react";

interface ProfileClientProps {
  role: string;
  inventarioUrl?: string;
}

export function ProfileClient({ role, inventarioUrl }: ProfileClientProps) {
  const isSuperAdmin = role === "SUPERADMIN";

  const [form, setForm] = useState({ currentPassword: "", username: "", newPassword: "" });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.currentPassword) {
      toast.error("Debes ingresar tu contraseña actual para confirmar");
      return;
    }
    if (!form.username && !form.newPassword) {
      toast.error("Ingresa al menos un campo a actualizar");
      return;
    }
    setLoading(true);
    const body: Record<string, string> = { currentPassword: form.currentPassword };
    if (isSuperAdmin && form.username) body.username = form.username;
    if (form.newPassword) body.password = form.newPassword;

    const res = await fetch("/api/admin/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Perfil actualizado");
      setForm({ currentPassword: "", username: "", newPassword: "" });
    } else {
      const data = await res.json();
      toast.error(typeof data.error === "string" ? data.error : "Error al actualizar");
    }
  }

  return (
    <div className="space-y-4 max-w-md">
      {inventarioUrl && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Sistema de Inventario</p>
              <p className="text-xs text-blue-600 mt-0.5">Gestiona el stock del restaurante</p>
            </div>
          </div>
          <a
            href={inventarioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shrink-0"
          >
            Ir al inventario
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Contraseña actual *</Label>
          <div className="relative">
            <Input
              type={showCurrent ? "text" : "password"}
              value={form.currentPassword}
              onChange={(e) => set("currentPassword", e.target.value)}
              required placeholder="Tu contraseña actual"
              className="pr-10"
            />
            <button type="button" onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A6358] hover:text-[#2C1F15]" tabIndex={-1}>
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isSuperAdmin && (
          <div className="space-y-1.5">
            <Label>Nuevo usuario</Label>
            <Input
              type="text"
              value={form.username}
              onChange={(e) => set("username", e.target.value.toLowerCase().replace(/\s/g, ""))}
              minLength={3}
              placeholder="Dejar vacío para no cambiar"
              autoComplete="off"
            />
            <p className="text-xs text-[#7A6358]">Mínimo 3 caracteres, sin espacios</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Nueva contraseña</Label>
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={form.newPassword}
              onChange={(e) => set("newPassword", e.target.value)}
              minLength={6}
              placeholder="Dejar vacío para no cambiar"
              className="pr-10"
            />
            <button type="button" onClick={() => setShowNew((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A6358] hover:text-[#2C1F15]" tabIndex={-1}>
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-[#7A6358]">Mín. 6 caracteres si cambia</p>
        </div>

        <Button type="submit" disabled={loading} className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] w-full">
          {loading ? "Guardando..." : "Guardar cambios"}
        </Button>
      </form>
      </div>
    </div>
  );
}
