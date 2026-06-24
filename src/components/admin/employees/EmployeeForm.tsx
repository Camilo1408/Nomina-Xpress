"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, KeyRound, UserPlus, ShieldCheck, User } from "lucide-react";

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 9);
}
function displayThousands(raw: string): string {
  if (!raw) return "";
  return Number(raw).toLocaleString("es-CO");
}

type AccessRole = "NONE" | "EMPLOYEE" | "ADMIN";

interface EmployeeFormProps {
  employee?: {
    id: string;
    name: string;
    documentId: string | null;
    phone: string | null;
    hourlyRateNormal: number;
    hourlyRateSpecial: number;
    tipPercent: number;
    payType: string;
    active: boolean;
  };
  existingUser?: { username: string; role: string } | null;
}

type PayType = "PAYROLL" | "SHIFT";

const roleLabels: Record<string, string> = {
  EMPLOYEE: "Personal",
  ADMIN: "Admin",
  SUPERADMIN: "Superadmin",
};

const roleBadgeStyle: Record<string, string> = {
  EMPLOYEE: "bg-[#6B8E6B]/10 text-[#6B8E6B] border-0",
  ADMIN: "bg-[#C1643F]/10 text-[#C1643F] border-0",
  SUPERADMIN: "bg-[#2C1F15]/10 text-[#2C1F15] border-0",
};

export function EmployeeForm({ employee, existingUser }: EmployeeFormProps) {
  const router = useRouter();
  const isEdit = !!employee;

  const [form, setForm] = useState({
    name: employee?.name ?? "",
    documentId: employee?.documentId ?? "",
    phone: employee?.phone ?? "",
    hourlyRateNormal: String(employee?.hourlyRateNormal ?? 6900),
    hourlyRateSpecial: String(employee?.hourlyRateSpecial ?? 11400),
    tipPercent: employee?.tipPercent ?? 100,
    payType: (employee?.payType ?? "PAYROLL") as PayType,
    accessRole: "NONE" as AccessRole,
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Edit mode: update existing credentials
  const [credUsername, setCredUsername] = useState(existingUser?.username ?? "");
  const [credPassword, setCredPassword] = useState("");
  const [credRole, setCredRole] = useState<"EMPLOYEE" | "ADMIN">(
    (existingUser?.role === "ADMIN" ? "ADMIN" : "EMPLOYEE") as "EMPLOYEE" | "ADMIN"
  );
  const [showCredPassword, setShowCredPassword] = useState(false);
  const [credLoading, setCredLoading] = useState(false);

  // Edit mode: create credentials for employee without access
  const [creatingAccess, setCreatingAccess] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"EMPLOYEE" | "ADMIN">("EMPLOYEE");
  const [showNewPassword, setShowNewPassword] = useState(false);

  function set(field: string, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

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
        tipPercent: Number(form.tipPercent),
      }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success(isEdit ? "Personal actualizado" : "Personal creado");
      router.push("/admin/employees");
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error?.message ?? "Error al guardar");
    }
  }

  async function handleUpdateCredentials(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, string> = {};
    if (credUsername && credUsername !== existingUser?.username) body.username = credUsername;
    if (credPassword) body.password = credPassword;
    if (credRole !== existingUser?.role) body.role = credRole;
    if (Object.keys(body).length === 0) {
      toast.info("Sin cambios para guardar");
      return;
    }
    setCredLoading(true);
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

  async function handleCreateCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    setCredLoading(true);
    const res = await fetch(`/api/admin/employees/${employee!.id}/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
    });
    setCredLoading(false);
    if (res.ok) {
      toast.success("Acceso creado");
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error?.message ?? "Error al crear acceso");
    }
  }

  const needsCredentials = form.accessRole !== "NONE";

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
              type="text"
              inputMode="numeric"
              value={displayThousands(form.hourlyRateNormal)}
              onChange={(e) => set("hourlyRateNormal", digitsOnly(e.target.value))}
              placeholder="Ej: 6.400"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tarifa hora especial (COP) *</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={displayThousands(form.hourlyRateSpecial)}
              onChange={(e) => set("hourlyRateSpecial", digitsOnly(e.target.value))}
              placeholder="Ej: 11.500"
              required
            />
            <p className="text-xs text-[#7A6358]">Aplica para domingos y festivos colombianos</p>
          </div>
          <div className="space-y-1.5">
            <Label>% Participación en propinas *</Label>
            <Input
              type="number" value={form.tipPercent}
              onChange={(e) => set("tipPercent", e.target.value)}
              min="0" max="100" step="1" required
            />
            <p className="text-xs text-[#7A6358]">
              0 = no participa · 50 = media participación · 100 = participación completa
            </p>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Tipo de pago *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { value: "PAYROLL", label: "Pago de nómina", desc: "Personal fijo bajo nómina" },
                { value: "SHIFT", label: "Pago por turnos", desc: "Personal pagado por turnos" },
              ] as const).map(({ value, label, desc }) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    form.payType === value
                      ? "border-[#C1643F] bg-[#C1643F]/5"
                      : "border-[#E0D5CA] hover:border-[#C1643F]/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="payType"
                    value={value}
                    checked={form.payType === value}
                    onChange={() => set("payType", value)}
                    className="accent-[#C1643F] mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[#2C1F15]">{label}</span>
                    <p className="text-xs text-[#7A6358] mt-0.5">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Acceso al sistema — solo en CREATE ── */}
        {!isEdit && (
          <div className="border border-[#E0D5CA] rounded-lg p-4 space-y-4">
            <p className="text-sm font-semibold text-[#2C1F15]">Acceso al sistema</p>
            <div className="space-y-2">
              {(
                [
                  { value: "NONE", label: "Sin acceso", desc: "Solo aparece en registros internos", icon: null },
                  { value: "EMPLOYEE", label: "Personal", desc: "Puede ver su quincena y horario en el portal", icon: User },
                  { value: "ADMIN", label: "Admin", desc: "Puede registrar horas y ver reportes", icon: ShieldCheck },
                ] as const
              ).map(({ value, label, desc, icon: Icon }) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    form.accessRole === value
                      ? "border-[#C1643F] bg-[#C1643F]/5"
                      : "border-[#E0D5CA] hover:border-[#C1643F]/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="accessRole"
                    value={value}
                    checked={form.accessRole === value}
                    onChange={() => set("accessRole", value)}
                    className="accent-[#C1643F] mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {Icon && <Icon className="w-3.5 h-3.5 text-[#C1643F]" />}
                      <span className="text-sm font-medium text-[#2C1F15]">{label}</span>
                    </div>
                    <p className="text-xs text-[#7A6358] mt-0.5">{desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {needsCredentials && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-[#E0D5CA]">
                <div className="space-y-1.5">
                  <Label>Usuario *</Label>
                  <Input
                    type="text"
                    value={form.username}
                    onChange={(e) => set("username", e.target.value.toLowerCase().replace(/\s/g, ""))}
                    required={needsCredentials}
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
                      required={needsCredentials}
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

      {/* ── Acceso al sistema — EDIT mode (SUPERADMIN only) ── */}
      {isEdit && (
        <div className="max-w-xl">
          <div className="border border-[#E0D5CA] rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#7A6358]" />
              <h3 className="text-sm font-semibold text-[#2C1F15]">Acceso al sistema</h3>
              {existingUser && (
                <Badge className={roleBadgeStyle[existingUser.role] ?? "bg-gray-100 text-gray-600 border-0"}>
                  {roleLabels[existingUser.role] ?? existingUser.role}
                </Badge>
              )}
            </div>

            {existingUser ? (
              <form onSubmit={handleUpdateCredentials} className="space-y-4">
                <p className="text-xs text-[#7A6358]">
                  Usuario actual: <span className="font-mono font-medium text-[#2C1F15]">@{existingUser.username}</span>
                </p>

                {/* Role selector */}
                {existingUser.role !== "SUPERADMIN" && existingUser.role !== "PROPRIETARY" && (
                  <div className="space-y-1.5">
                    <Label>Rol de acceso</Label>
                    <div className="flex gap-3">
                      {(["EMPLOYEE", "ADMIN"] as const).map((r) => (
                        <label key={r} className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer transition-colors ${
                          credRole === r ? "border-[#C1643F] bg-[#C1643F]/5 text-[#C1643F]" : "border-[#E0D5CA] text-[#7A6358]"
                        }`}>
                          <input
                            type="radio" name="credRole" value={r}
                            checked={credRole === r}
                            onChange={() => setCredRole(r)}
                            className="accent-[#C1643F]"
                          />
                          {roleLabels[r]}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Cambiar usuario</Label>
                    <Input
                      type="text" value={credUsername}
                      onChange={(e) => setCredUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                      minLength={3} placeholder={existingUser.username}
                      autoComplete="off"
                      disabled={existingUser.role === "SUPERADMIN" || existingUser.role === "PROPRIETARY"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nueva contraseña</Label>
                    <div className="relative">
                      <Input
                        type={showCredPassword ? "text" : "password"}
                        value={credPassword}
                        onChange={(e) => setCredPassword(e.target.value)}
                        minLength={6} placeholder="Dejar vacío para no cambiar"
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
              <form onSubmit={handleCreateCredentials} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Rol de acceso</Label>
                  <div className="flex gap-3">
                    {(["EMPLOYEE", "ADMIN"] as const).map((r) => (
                      <label key={r} className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer transition-colors ${
                        newRole === r ? "border-[#C1643F] bg-[#C1643F]/5 text-[#C1643F]" : "border-[#E0D5CA] text-[#7A6358]"
                      }`}>
                        <input
                          type="radio" name="newRole" value={r}
                          checked={newRole === r}
                          onChange={() => setNewRole(r)}
                          className="accent-[#C1643F]"
                        />
                        {roleLabels[r]}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Usuario *</Label>
                    <Input
                      type="text" value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                      required minLength={3} placeholder="ej: juan.perez" autoComplete="off"
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
                        required minLength={6} placeholder="Mín. 6 caracteres" className="pr-10"
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
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#7A6358]">Este empleado no tiene acceso al sistema.</p>
                <Button
                  type="button" size="sm" variant="outline"
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
