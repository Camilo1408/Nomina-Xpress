"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, LockOpen, MoreHorizontal, Pencil, Power } from "lucide-react";
import { ResetPasswordDialog } from "./ResetPasswordDialog";

interface UserActionsProps {
  userId: string;
  username: string;
  active: boolean;
  isProprietary: boolean;
  canManagePermissions: boolean;
  canDeactivate: boolean;
  /** PROPRIETARY/SUPERADMIN: desbloquear y restablecer contraseña (CP-45). */
  canRecoverAccess: boolean;
  /** El usuario tiene un bloqueo vigente por intentos fallidos. */
  locked: boolean;
  /** Es el usuario de la sesión: su clave se cambia en Mi perfil. */
  isSelf: boolean;
}

export function UserActions({
  userId,
  username,
  active,
  isProprietary,
  canManagePermissions,
  canDeactivate,
  canRecoverAccess,
  locked,
  isSelf,
}: UserActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function update() {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  async function toggle() {
    setLoading(true);
    setOpen(false);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success(active ? "Usuario desactivado" : "Usuario activado");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "Error al cambiar estado");
    }
  }

  async function unlock() {
    setLoading(true);
    setOpen(false);
    const res = await fetch(`/api/admin/users/${userId}/unlock`, { method: "POST" });
    setLoading(false);
    if (res.ok) {
      toast.success(`@${username} puede volver a iniciar sesión`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "No se pudo desbloquear");
    }
  }

  // El PROPRIETARY no se edita desde aquí (la API lo rechaza), pero sí se puede
  // desbloquear: solo borra sus contadores de intentos fallidos.
  const showPermissions = canManagePermissions && !isProprietary;
  const showToggle = canDeactivate && !isProprietary;
  const showUnlock = canRecoverAccess && locked;
  const showReset = canRecoverAccess && !isProprietary && !isSelf;
  if (!showPermissions && !showToggle && !showUnlock && !showReset) return null;

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="p-1.5 rounded hover:bg-[#F2EDE6] transition-colors text-[#7A6358]"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && coords && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[61] w-56 rounded-md border border-[#E0D5CA] bg-white shadow-lg py-1"
            style={{ top: coords.top, right: coords.right }}
          >
            {showUnlock && (
              <button
                onClick={unlock}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#2C1F15] hover:bg-[#F2EDE6]"
              >
                <LockOpen className="w-3.5 h-3.5" /> Desbloquear inicio de sesión
              </button>
            )}
            {showReset && (
              <button
                onClick={() => { setOpen(false); setResetOpen(true); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#2C1F15] hover:bg-[#F2EDE6]"
              >
                <KeyRound className="w-3.5 h-3.5" /> Restablecer contraseña
              </button>
            )}
            {showPermissions && (
              <button
                onClick={() => { setOpen(false); router.push(`/admin/usuarios/${userId}`); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#2C1F15] hover:bg-[#F2EDE6]"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar permisos
              </button>
            )}
            {showToggle && (
              <button
                onClick={toggle}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#2C1F15] hover:bg-[#F2EDE6]"
              >
                <Power className="w-3.5 h-3.5" />
                {active ? "Desactivar acceso" : "Activar acceso"}
              </button>
            )}
          </div>
        </>,
        document.body
      )}

      {showReset && (
        <ResetPasswordDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          userId={userId}
          username={username}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}
