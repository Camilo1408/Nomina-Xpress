"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";

export function PortalProfileClient() {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      toast.error("Las contraseñas nuevas no coinciden");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/employee/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Contraseña actualizada");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } else {
      const data = await res.json();
      toast.error(typeof data.error === "string" ? data.error : "Error al actualizar");
    }
  }

  return (
    <div className="bg-white rounded-lg border border-[#E0D5CA] shadow-[0_1px_3px_rgba(44,31,21,0.08)] p-6 max-w-md">
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

        <div className="space-y-1.5">
          <Label>Nueva contraseña *</Label>
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={form.newPassword}
              onChange={(e) => set("newPassword", e.target.value)}
              required minLength={6}
              placeholder="Mín. 6 caracteres"
              className="pr-10"
            />
            <button type="button" onClick={() => setShowNew((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A6358] hover:text-[#2C1F15]" tabIndex={-1}>
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Confirmar nueva contraseña *</Label>
          <Input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => set("confirmPassword", e.target.value)}
            required minLength={6}
            placeholder="Repite la nueva contraseña"
          />
        </div>

        <Button type="submit" disabled={loading} className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] w-full">
          {loading ? "Guardando..." : "Cambiar contraseña"}
        </Button>
      </form>
    </div>
  );
}
