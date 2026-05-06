"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, KeyRound, UserPlus } from "lucide-react";

interface EmployeeFormProps {
  employee?: {
    id: string;
    name: string;
    documentId: string | null;
    phone: string | null;
    hourlyRateNormal: number;
    hourlyRateSpecial: number;
    active: boolean;
  };
  existingUser?: { username: string } | null;
}

export function EmployeeForm({ employee, existingUser }: EmployeeFormProps) {
  const router = useRouter();
  const isEdit = !!employee;

  // --- Employee data form ---
  const [form, setForm] = useState({
    name: employee?.name ?? "",
    documentId: employee?.documentId ?? "",
    phone: employee?.phone ?? "",
    hourlyRateNormal: employee?.hourlyRateNormal ?? 6400,
    hourlyRateSpecial: employee?.hourlyRateSpecial ?? 11500,
    createPortalAccess: false,
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- Credentials section (edit mode only) ---
  const [credUsername, setCredUsername] = useState(existingUser?.username ?? "");
  const [credPassword, setCredPassword] = useState("");
  const [showCredPassword, setShowCredPassword] = useState(false);
  const [credLoading, setCredLoading] = useState(false);
  // For employees without user: toggle create form
  const [creatingAccess, setCreatingAccess] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  function set(field: string, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Save employee basic data
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const url = isEdit ? `/api/admin/employees/${employee!.id}` : "/api/admin/employees";
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        hourlyRateNormal: Number(form.hourlyRateNormal),
        hourlyRateSpecial: Number(form.hourlyRateSpecial),
      }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success(isEdit ? "Empleado actualizado" : "Empleado creado");
      router.push("/admin/employees");
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error?.message ?? "Error al guardar");
    }
  }

  // Update existing credentials (username and/or password)
  async function handleUpdateCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!credUsername && !credPassword) return;
    setCredLoading(true);
    const body: Record<string, string> = {};
    if (credUsername && credUsername !== existingUser?.username) body.username = credUsername;
    if (credPassword) body.password = credPassword;
    if (Object.keys(body).length === 0) {
      toast.info("Sin cambios para guardar");
      setCredLoading(false);
      return;
    }
    const res = await fetch(`/api/admin/employees/${employee!.id}/credentials`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setCredLoading(false);
    if (res.ok) {
      toast.success("Credenciales actualizadas");
      setCredPassword("");
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error?.message ?? "Error al actualizar credenciales");
    }
  }

  // Create credentials for employee without access
  async function handleCreateCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    setCredLoading(true);
    const res = await fetch(`/api/admin/employees/${employee!.id}/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword }),
    });
    setCredLoading(false);
    if (res.ok) {
      toast.success("Acceso al portal creado");
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error?.message ?? "Error al crear acceso");
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Datos del empleado ── */}
      <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nombre completo *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Número de cédula</Label>
            <Input value={form.documentId} onChange={(e) => set("documentId", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tarifa hora normal (COP) *</Label>
            <Input
              type="number"
              value={form.hourlyRateNormal}
              onChange={(e) => set("hourlyRateNormal", e.target.value)}
              min="0" step="100" required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tarifa hora especial (COP) *</Label>
            <Input
              type="number"
              value={form.hourlyRateSpecial}
              onChange={(e) => set("hourlyRateSpecial", e.target.value)}
              min="0" step="100" required
            />
            <p className="text-xs text-[#7A6358]">Aplica para domingos y festivos colombianos</p>
          </div>
        </div>

        {/* Portal access — CREATE mode only */}
        {!isEdit && (
          <div className="border border-[#E0D5CA] rounded-lg p-4 space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.createPortalAccess}
                onChange={(e) => set("createPortalAccess", e.target.checked)}
                className="accent-[#C1643F]"
              />
              <span className="text-sm font-medium text-[#2C1F15]">Crear acceso al portal del empleado</span>
            </label>
            {form.createPortalAccess && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
                <div className="space-y-1.5">
                  <Label>Usuario *</Label>
                  <Input
                    type="text"
                    value={form.username}
                    onChange={(e) => set("username", e.target.value.toLowerCase().replace(/\s/g, ""))}
                    required={form.createPortalAccess}
                    minLength={3}
                    placeholder="ej: juan.perez"
                    autoComplete="off"
                  />
                  <p className="text-xs text-[#7A6358]">Mínimo 3 caracteres, sin espacios</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Contraseña provisional *</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      minLength={6}
                      required={form.createPortalAccess}
                      placeholder="Mín. 6 caracteres"
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A6358] hover:text-[#2C1F15]" tabIndex={-1}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading} className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]">
            {loading ? "Guardando..." : isEdit ? "Actualizar empleado" : "Crear empleado"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/admin/employees")} className="border-[#E0D5CA]">
            Cancelar
          </Button>
        </div>
      </form>

      {/* ── Acceso al portal — EDIT mode only ── */}
      {isEdit && (
        <div className="max-w-xl">
          <div className="border border-[#E0D5CA] rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#7A6358]" />
              <h3 className="text-sm font-semibold text-[#2C1F15]">Acceso al portal</h3>
            </div>

            {existingUser ? (
              /* Edit existing credentials */
              <form onSubmit={handleUpdateCredentials} className="space-y-4">
                <p className="text-xs text-[#7A6358]">
                  Usuario actual: <span className="font-mono font-medium text-[#2C1F15]">@{existingUser.username}</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Cambiar usuario</Label>
                    <Input
                      type="text"
                      value={credUsername}
                      onChange={(e) => setCredUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                      minLength={3}
                      placeholder={existingUser.username}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nueva contraseña</Label>
                    <div className="relative">
                      <Input
                        type={showCredPassword ? "text" : "password"}
                        value={credPassword}
                        onChange={(e) => setCredPassword(e.target.value)}
                        minLength={6}
                        placeholder="Dejar vacío para no cambiar"
                        className="pr-10"
                      />
                      <button type="button" onClick={() => setShowCredPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A6358] hover:text-[#2C1F15]" tabIndex={-1}>
                        {showCredPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-[#7A6358]">Mín. 6 caracteres si cambia</p>
                  </div>
                </div>
                <Button type="submit" disabled={credLoading} size="sm" className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]">
                  {credLoading ? "Guardando..." : "Guardar credenciales"}
                </Button>
              </form>
            ) : creatingAccess ? (
              /* Create credentials for employee without access */
              <form onSubmit={handleCreateCredentials} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Usuario *</Label>
                    <Input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                      required minLength={3}
                      placeholder="ej: juan.perez"
                      autoComplete="off"
                    />
                    <p className="text-xs text-[#7A6358]">Mínimo 3 caracteres, sin espacios</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contraseña *</Label>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required minLength={6}
                        placeholder="Mín. 6 caracteres"
                        className="pr-10"
                      />
                      <button type="button" onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A6358] hover:text-[#2C1F15]" tabIndex={-1}>
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={credLoading} size="sm" className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]">
                    {credLoading ? "Creando..." : "Crear acceso"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setCreatingAccess(false)} className="border-[#E0D5CA]">
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              /* No access yet — invite to create */
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#7A6358]">Este empleado no tiene acceso al portal.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCreatingAccess(true)}
                  className="border-[#C1643F] text-[#C1643F] hover:bg-[#C1643F]/5 gap-1.5"
                >
                  <UserPlus className="w-4 h-4" /> Crear acceso
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
