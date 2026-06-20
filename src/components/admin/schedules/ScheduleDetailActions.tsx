"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pencil, Globe, Trash2, GlobeLock } from "lucide-react";

interface Props {
  scheduleId: string;
  published: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
}

export function ScheduleDetailActions({ scheduleId, published, canEdit, canPublish, canDelete }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pubLoading, setPubLoading] = useState(false);

  async function handlePublish() {
    setPubLoading(true);
    const res = await fetch(`/api/admin/schedules/${scheduleId}/publish`, { method: "POST" });
    setPubLoading(false);
    if (res.ok) {
      const data = await res.json();
      toast.success(data.published ? "Horario publicado" : "Horario despublicado");
      router.refresh();
    } else {
      toast.error("Error al cambiar estado");
    }
  }

  async function handleDelete() {
    setOpen(false);
    const res = await fetch(`/api/admin/schedules/${scheduleId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Horario eliminado");
      router.push("/admin/schedules");
    } else {
      toast.error("Error al eliminar");
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {canEdit && (
          <Link href={`/admin/schedules/${scheduleId}`}>
            <Button variant="outline" size="sm" className="gap-1.5 border-[#E0D5CA] text-[#2C1F15]">
              <Pencil className="w-4 h-4" /> Editar
            </Button>
          </Link>
        )}
        {canPublish && (
          <Button
            variant="outline"
            size="sm"
            onClick={handlePublish}
            disabled={pubLoading}
            className={`gap-1.5 ${
              published
                ? "border-[#6B8E6B] text-[#6B8E6B] hover:bg-[#6B8E6B]/5"
                : "border-[#6B8E6B] text-[#6B8E6B] hover:bg-[#6B8E6B]/5"
            }`}
          >
            {published ? (
              <><GlobeLock className="w-4 h-4" /> Despublicar</>
            ) : (
              <><Globe className="w-4 h-4" /> Publicar</>
            )}
          </Button>
        )}
        {canDelete && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            className="gap-1.5 border-[#B94040] text-[#B94040] hover:bg-[#B94040]/5"
          >
            <Trash2 className="w-4 h-4" /> Eliminar
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={open}
        title="Eliminar horario"
        description="Se eliminará este horario y todos sus turnos. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
