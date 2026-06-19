"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Power } from "lucide-react";

interface UserActionsProps {
  userId: string;
  active: boolean;
  isProprietary: boolean;
  canManagePermissions: boolean;
  canDeactivate: boolean;
}

export function UserActions({ userId, active, isProprietary, canManagePermissions, canDeactivate }: UserActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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

  if (isProprietary) return null;
  if (!canManagePermissions && !canDeactivate) return null;

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
            className="fixed z-[61] w-48 rounded-md border border-[#E0D5CA] bg-white shadow-lg py-1"
            style={{ top: coords.top, right: coords.right }}
          >
            {canManagePermissions && (
              <button
                onClick={() => { setOpen(false); router.push(`/admin/usuarios/${userId}`); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#2C1F15] hover:bg-[#F2EDE6]"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar permisos
              </button>
            )}
            {canDeactivate && (
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
    </div>
  );
}
