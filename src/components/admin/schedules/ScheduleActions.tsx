"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pencil, Globe, Trash2 } from "lucide-react";

export function ScheduleActions({ scheduleId, published }: { scheduleId: string; published: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handlePublish() {
    const res = await fetch(`/api/admin/schedules/${scheduleId}/publish`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      toast.success(data.published ? "Horario publicado" : "Horario despublicado");
      router.refresh();
    }
  }

  async function handleDelete() {
    setOpen(false);
    const res = await fetch(`/api/admin/schedules/${scheduleId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Horario eliminado");
      router.refresh();
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Link href={`/admin/schedules/${scheduleId}`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-[#7A6358] hover:text-[#C1643F]">
            <Pencil className="w-4 h-4" />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePublish}
          className={`h-8 w-8 p-0 ${published ? "text-[#6B8E6B]" : "text-[#7A6358] hover:text-[#6B8E6B]"}`}
        >
          <Globe className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="h-8 w-8 p-0 text-[#7A6358] hover:text-[#B94040]"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
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
