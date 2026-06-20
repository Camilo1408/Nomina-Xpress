"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CustomRole { id: string; name: string; }
interface Employee { id: string; name: string; }

interface NewUserFormProps {
  customRoles: CustomRole[];
  employees: Employee[];
}

export function NewUserForm({ customRoles, employees }: NewUserFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "ADMIN" as "ADMIN" | "SUPERADMIN",
    customRoleId: "",
    employeeId: "",
  });
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const payload = {
      username: form.username,
      password: form.password,
      role: form.role,
      customRoleId: form.customRoleId || null,
      employeeId: form.employeeId || null,
    };

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = typeof data.error === "string" ? data.error : data.error?.message ?? "Error al crear usuario";
      toast.error(msg);
      return;
    }

    toast.success("Usuario creado");
    router.push("/admin/usuarios");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Username */}
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Nombre de usuario *</Label>
          <Input
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            placeholder="Ej: supervisor01"
            required
            minLength={3}
          />
        </div>

        {/* Password */}
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Contraseña *</Label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="Mínimo 6 caracteres"
            required
            minLength={6}
          />
        </div>

        {/* Rol base */}
        <div className="space-y-1.5">
          <Label>Rol base *</Label>
          <select
            value={form.role}
            onChange={(e) => set("role", e.target.value)}
            className="w-full rounded-md border border-[#E0D5CA] bg-white px-3 py-2 text-sm text-[#2C1F15] focus:outline-none focus:ring-2 focus:ring-[#C1643F]/30"
          >
            <option value="ADMIN">ADMIN</option>
            <option value="SUPERADMIN">SUPERADMIN</option>
          </select>
          <p className="text-xs text-[#7A6358]">
            Determina el acceso al portal. Los permisos reales vienen del rol personalizado.
          </p>
        </div>

        {/* Rol personalizado */}
        {customRoles.length > 0 && (
          <div className="space-y-1.5">
            <Label>Rol personalizado</Label>
            <select
              value={form.customRoleId}
              onChange={(e) => set("customRoleId", e.target.value)}
              className="w-full rounded-md border border-[#E0D5CA] bg-white px-3 py-2 text-sm text-[#2C1F15] focus:outline-none focus:ring-2 focus:ring-[#C1643F]/30"
            >
              <option value="">(ninguno — usar permisos del rol base)</option>
              {customRoles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Empleado (opcional) */}
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Vincular a empleado pagable (opcional)</Label>
          <select
            value={form.employeeId}
            onChange={(e) => set("employeeId", e.target.value)}
            className="w-full rounded-md border border-[#E0D5CA] bg-white px-3 py-2 text-sm text-[#2C1F15] focus:outline-none focus:ring-2 focus:ring-[#C1643F]/30"
          >
            <option value="">(ninguno — usuario solo del sistema, no pagable)</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
          <p className="text-xs text-[#7A6358]">
            Sin empleado vinculado: el usuario no aparecerá en nómina, horas, bonos ni reportes de pago.
          </p>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={loading}
          className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]"
        >
          {loading ? "Creando..." : "Crear usuario"}
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
    </form>
  );
}
