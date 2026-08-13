"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";

interface ReasonDialogProps {
  open: boolean;
  title: string;
  description: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  minLength?: number;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/**
 * Diálogo con un campo de texto obligatorio, para reemplazar `window.prompt()`.
 * Mismo lenguaje visual que ConfirmDialog.
 */
export function ReasonDialog({
  open,
  title,
  description,
  placeholder = "Queda registrado en la auditoría",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  minLength = 3,
  onConfirm,
  onCancel,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");

  // Se limpia al ABRIR, no dentro del efecto de forma incondicional: evita el
  // setState síncrono en el cuerpo del efecto que dispara en cada render.
  const [wasOpen, setWasOpen] = useState(open);
  if (open && !wasOpen) {
    setWasOpen(true);
    if (reason !== "") setReason("");
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const valido = reason.trim().length >= minLength;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "rgba(185,64,64,0.1)" }}
            >
              <AlertTriangle className="w-5 h-5" style={{ color: "#B94040" }} />
            </div>
            <div className="space-y-1 pt-0.5">
              <DialogTitle className="text-[#2C1F15]">{title}</DialogTitle>
              <DialogDescription className="text-[#7A6358]">{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="pl-13">
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valido) onConfirm(reason.trim());
            }}
          />
        </div>
        <DialogFooter className="bg-transparent border-0 -mx-0 -mb-0 p-0 pt-2 flex-row justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="border-[#E0D5CA] text-[#7A6358] hover:bg-[#F2EDE6]"
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(reason.trim())}
            disabled={!valido}
            className="text-white bg-[#B94040] hover:bg-[#9A3535] disabled:opacity-50"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
