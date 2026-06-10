"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pencil, UserX, UserCheck, Trash2 } from "lucide-react";

export function EmployeeActions({
  employeeId,
  active,
  canManageLifecycle,
}: {
  employeeId: string;
  active: boolean;
  canManageLifecycle: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"deactivate" | "reactivate" | "delete" | null>(null);

  async function handleDeactivate() {
    setDialog(null);
    const res = await fetch(`/api/admin/employees/${employeeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    if (res.ok) {
      toast.success("Empleado desactivado");
      router.refresh();
    } else {
      toast.error("Error al desactivar");
    }
  }

  async function handleReactivate() {
    setDialog(null);
    const res = await fetch(`/api/admin/employees/${employeeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    if (res.ok) {
      toast.success("Empleado reactivado");
      router.refresh();
    } else {
      toast.error("Error al reactivar");
    }
  }

  async function handleDelete() {
    setDialog(null);
    const res = await fetch(`/api/admin/employees/${employeeId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Empleado eliminado");
      router.refresh();
    } else {
      toast.error("Error al eliminar");
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Link href={`/admin/employees/${employeeId}`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-[#7A6358] hover:text-[#C1643F]" title="Editar">
            <Pencil className="w-4 h-4" />
          </Button>
        </Link>

        {canManageLifecycle && (active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDialog("deactivate")}
            className="h-8 w-8 p-0 text-[#7A6358] hover:text-[#C27A1A]"
            title="Desactivar"
          >
            <UserX className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDialog("reactivate")}
            className="h-8 w-8 p-0 text-[#7A6358] hover:text-[#3A7D44]"
            title="Reactivar"
          >
            <UserCheck className="w-4 h-4" />
          </Button>
        ))}

        {canManageLifecycle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDialog("delete")}
            className="h-8 w-8 p-0 text-[#7A6358] hover:text-[#B94040]"
            title="Eliminar permanentemente"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={dialog === "deactivate"}
        title="Desactivar empleado"
        description="El empleado quedará inactivo y no aparecerá en los registros activos. Puedes reactivarlo en cualquier momento."
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={handleDeactivate}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === "reactivate"}
        title="Reactivar empleado"
        description="El empleado volverá a estar activo y podrá registrar horas nuevamente."
        confirmLabel="Reactivar"
        cancelLabel="Cancelar"
        variant="success"
        onConfirm={handleReactivate}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        title="Eliminar empleado"
        description="Se eliminarán permanentemente el empleado y todos sus registros de horas, horarios y ajustes. Esta acción no se puede deshacer."
        confirmLabel="Eliminar todo"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
