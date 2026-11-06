"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Mismo mínimo que PASSWORD_MIN_LENGTH (src/lib/password-policy.ts); el servidor
// lo vuelve a validar.
const MIN = 10;

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
  onDone: () => void;
}

/**
 * Restablece la contraseña de otro usuario (PROPRIETARY/SUPERADMIN, CP-45). La
 * clave nueva también levanta el bloqueo por intentos fallidos y cierra las
 * sesiones abiertas del usuario (RN-19).
 */
export function ResetPasswordDialog({ open, onOpenChange, userId, username, onDone }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSave = password.length >= MIN && confirm === password && !saving;

  function close(next: boolean) {
    if (!next) {
      setPassword("");
      setConfirm("");
      setShow(false);
    }
    onOpenChange(next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(`Contraseña de @${username} restablecida`);
      close(false);
      onDone();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "No se pudo restablecer la contraseña");
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#2C1F15] flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#C1643F]" />
            Restablecer contraseña
          </DialogTitle>
          <DialogDescription className="text-[#7A6358]">
            Nueva contraseña para <strong>@{username}</strong>. Se cierran sus sesiones abiertas y, si
            estaba bloqueado por intentos fallidos, queda desbloqueado. Comunícale la clave por un
            canal privado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-password">Nueva contraseña</Label>
            <div className="relative">
              <Input
                id="reset-password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={MIN}
                autoComplete="new-password"
                placeholder={`Mínimo ${MIN} caracteres`}
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#7A6358] hover:text-[#2C1F15]"
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {tooShort && <p className="text-xs text-[#B94040]">Mínimo {MIN} caracteres.</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm">Confirmar contraseña</Label>
            <Input
              id="reset-confirm"
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            {mismatch && <p className="text-xs text-[#B94040]">Las contraseñas no coinciden.</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!canSave}
              className="bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2]"
            >
              {saving ? "Guardando..." : "Restablecer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
