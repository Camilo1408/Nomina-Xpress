"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface EmployeeInfo {
  name: string;
  documentId: string | null;
  phone: string | null;
  hourlyRateNormal: number;
  hourlyRateSpecial: number;
}

interface ProfileClientProps {
  role: string;
  employee: EmployeeInfo | null;
}

export function ProfileClient({ role, employee }: ProfileClientProps) {
  const isSuperAdmin = role === "SUPERADMIN" || role === "PROPRIETARY";

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
    <div className="space-y-6 max-w-md">
      {employee && (
        <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6">
          <h2 className="text-sm font-semibold text-[#2C1F15] mb-4 uppercase tracking-wide">Mis datos</h2>
          <dl className="space-y-3">
            <div className="flex justify-between items-center py-1.5 border-b border-[#F2EDE6]">
              <dt className="text-sm text-[#7A6358]">Nombre</dt>
              <dd className="text-sm font-medium text-[#2C1F15]">{employee.name}</dd>
            </div>
            {employee.documentId && (
              <div className="flex justify-between items-center py-1.5 border-b border-[#F2EDE6]">
                <dt className="text-sm text-[#7A6358]">Cédula</dt>
                <dd className="text-sm font-mono text-[#2C1F15]">{employee.documentId}</dd>
              </div>
            )}
            {employee.phone && (
              <div className="flex justify-between items-center py-1.5 border-b border-[#F2EDE6]">
                <dt className="text-sm text-[#7A6358]">Teléfono</dt>
                <dd className="text-sm font-mono text-[#2C1F15]">{employee.phone}</dd>
              </div>
            )}
            <div className="flex justify-between items-center py-1.5 border-b border-[#F2EDE6]">
              <dt className="text-sm text-[#7A6358]">Hora normal</dt>
              <dd className="text-sm font-mono font-semibold text-[#2C1F15]">{formatCurrency(employee.hourlyRateNormal)}</dd>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <dt className="text-sm text-[#7A6358]">Hora especial</dt>
              <dd className="text-sm font-mono font-semibold text-[#C1643F]">{formatCurrency(employee.hourlyRateSpecial)}</dd>
            </div>
          </dl>
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
