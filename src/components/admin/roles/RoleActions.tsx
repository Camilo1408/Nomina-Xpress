"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2, Power } from "lucide-react";

interface RoleActionsProps {
  roleId: string;
  roleName: string;
  active: boolean;
  isSystem: boolean;
  userCount: number;
  canEdit: boolean;
  canDeactivate: boolean;
}

export function RoleActions({ roleId, roleName, active, isSystem, userCount, canEdit, canDeactivate }: RoleActionsProps) {
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
    const res = await fetch(`/api/admin/roles/${roleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success(active ? "Rol desactivado" : "Rol activado");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "Error al cambiar estado");
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar el rol "${roleName}"? Esta acción no se puede deshacer.`)) return;
    setLoading(true);
    setOpen(false);
    const res = await fetch(`/api/admin/roles/${roleId}`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) {
      toast.success("Rol eliminado");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "Error al eliminar");
    }
  }

  if (isSystem) return null;
  if (!canEdit && !canDeactivate) return null;

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
            className="fixed z-[61] w-44 rounded-md border border-[#E0D5CA] bg-white shadow-lg py-1"
            style={{ top: coords.top, right: coords.right }}
          >
            {canEdit && (
              <button
                onClick={() => { setOpen(false); router.push(`/admin/roles/${roleId}`); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#2C1F15] hover:bg-[#F2EDE6]"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            {canDeactivate && (
              <button
                onClick={toggle}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#2C1F15] hover:bg-[#F2EDE6]"
              >
                <Power className="w-3.5 h-3.5" />
                {active ? "Desactivar" : "Activar"}
              </button>
            )}
            {canEdit && userCount === 0 && (
              <button
                onClick={remove}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#B94040] hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
