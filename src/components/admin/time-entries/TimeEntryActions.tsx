"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pencil, Trash2 } from "lucide-react";

export function TimeEntryActions({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    setOpen(false);
    const res = await fetch(`/api/admin/time-entries/${entryId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Registro eliminado");
      router.refresh();
    } else {
      toast.error("Error al eliminar");
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Link href={`/admin/time-entries/${entryId}`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-[#7A6358] hover:text-[#C1643F]">
            <Pencil className="w-4 h-4" />
          </Button>
        </Link>
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
        title="Eliminar registro"
        description="Se eliminará permanentemente este registro de horas. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
