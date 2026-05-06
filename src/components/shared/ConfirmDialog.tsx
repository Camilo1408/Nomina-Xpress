"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "success";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const colors = {
    danger:  { bg: "rgba(185,64,64,0.1)",   icon: "#B94040", btn: "#B94040" },
    warning: { bg: "rgba(194,122,26,0.1)",  icon: "#C27A1A", btn: "#C27A1A" },
    success: { bg: "rgba(58,125,68,0.1)",   icon: "#3A7D44", btn: "#3A7D44" },
  }[variant];

  const Icon = variant === "success" ? CheckCircle2 : AlertTriangle;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: colors.bg }}
            >
              <Icon className="w-5 h-5" style={{ color: colors.icon }} />
            </div>
            <div className="space-y-1 pt-0.5">
              <DialogTitle className="text-[#2C1F15]">{title}</DialogTitle>
              <DialogDescription className="text-[#7A6358]">{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
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
            onClick={onConfirm}
            className="text-white"
            style={{ backgroundColor: colors.btn }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
