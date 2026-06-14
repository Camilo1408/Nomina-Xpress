"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImagePlus, Upload, X, Trash2 } from "lucide-react";

interface Tenant {
  id: string;
  name: string;
  logoUrl: string | null;
}

export function SettingsClient({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [name, setName] = useState(tenant.name);
  // savedLogoUrl tracks what's actually in the DB (updates after upload/delete)
  const [savedLogoUrl, setSavedLogoUrl] = useState(tenant.logoUrl);
  // logoFile is a pending file the user selected but hasn't uploaded yet
  const [logoFile, setLogoFile] = useState<File | null>(null);
  // logoPreview is the URL shown in the preview (blob URL or saved URL)
  const [logoPreview, setLogoPreview] = useState<string | null>(tenant.logoUrl);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El archivo debe pesar menos de 2 MB");
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    // Reset input so selecting the same file again fires onChange
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  // Cancel a pending file selection (revert preview to saved logo)
  function cancelPendingFile() {
    setLogoFile(null);
    setLogoPreview(savedLogoUrl);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Actually delete the saved logo from the DB and filesystem
  async function handleDeleteSavedLogo() {
    setRemovingLogo(true);
    const res = await fetch("/api/admin/tenant/logo", { method: "DELETE" });
    setRemovingLogo(false);
    if (res.ok) {
      setSavedLogoUrl(null);
      setLogoPreview(null);
      setLogoFile(null);
      toast.success("Logo eliminado");
      router.refresh();
    } else {
      toast.error("Error al eliminar el logo");
    }
  }

  async function handleLogoUpload() {
    if (!logoFile) return;
    setUploadingLogo(true);
    const fd = new FormData();
    fd.append("file", logoFile);
    const res = await fetch("/api/admin/tenant/logo", { method: "POST", body: fd });
    setUploadingLogo(false);
    if (res.ok) {
      const data = await res.json();
      setSavedLogoUrl(data.logoUrl);
      setLogoPreview(data.logoUrl);
      setLogoFile(null);
      toast.success("Logo actualizado");
      router.refresh();
    } else {
      toast.error("Error al subir el logo");
    }
  }

  async function handleSaveName() {
    setSaving(true);
    const res = await fetch("/api/admin/tenant", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Nombre guardado");
      router.refresh();
    } else {
      toast.error("Error al guardar");
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* Nombre */}
      <div className="bg-card rounded-lg border border-border shadow-sm p-6 space-y-4">
        <h2 className="text-base font-heading font-bold text-foreground">Nombre del restaurante</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del restaurante"
            className="flex-1"
          />
          <Button
            onClick={handleSaveName}
            disabled={saving || name === tenant.name}
            className="bg-[#C1643F] hover:bg-[#A8522F] text-white w-full sm:w-auto"
          >
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>

      {/* Logo */}
      <div className="bg-card rounded-lg border border-border shadow-sm p-6 space-y-4">
        <h2 className="text-base font-heading font-bold text-foreground">Logo del restaurante</h2>

        {/* Preview del logo guardado en BD */}
        {savedLogoUrl && !logoFile && (
          <div className="flex items-center gap-4 p-3 bg-muted rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={savedLogoUrl}
              alt="Logo actual"
              className="w-16 h-16 rounded-lg object-contain border border-border bg-white"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Logo actual</p>
              <p className="text-xs text-muted-foreground">Guardado en el sistema</p>
            </div>
            <button
              type="button"
              onClick={handleDeleteSavedLogo}
              disabled={removingLogo}
              className="text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
              title="Eliminar logo"
            >
              {removingLogo ? (
                <span className="text-xs">...</span>
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        )}

        {/* Preview del archivo seleccionado pero aún no subido */}
        {logoFile && logoPreview && (
          <div className="flex items-center gap-4 p-3 bg-muted rounded-lg border border-[#C1643F]/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoPreview}
              alt="Vista previa"
              className="w-16 h-16 rounded-lg object-contain border border-border bg-white"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Vista previa</p>
              <p className="text-xs text-muted-foreground truncate">{logoFile.name}</p>
            </div>
            <button
              type="button"
              onClick={cancelPendingFile}
              className="text-muted-foreground hover:text-[#2C1F15] transition-colors"
              title="Cancelar selección"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Sin logo guardado y sin archivo pendiente: mostrar NX por defecto */}
        {!savedLogoUrl && !logoFile && (
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border border-border">
            <div className="w-16 h-16 rounded-lg bg-[#C1643F] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xl font-heading">NX</span>
            </div>
            <p className="text-sm text-muted-foreground">Logo predeterminado — sube una imagen para personalizarlo</p>
          </div>
        )}

        {/* Drag & Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center gap-3
            rounded-xl border-2 border-dashed p-8 cursor-pointer
            transition-all duration-200
            ${isDragging
              ? "border-[#C1643F] bg-[#C1643F]/5 scale-[1.01]"
              : "border-border hover:border-[#C1643F] hover:bg-muted"
            }
          `}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors
            ${isDragging ? "bg-[#C1643F] text-white" : "bg-muted text-muted-foreground"}`}>
            <ImagePlus className="w-6 h-6" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {isDragging ? "Suelta el archivo aquí" : "Arrastra tu logo aquí"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              o <span className="text-[#C1643F] font-medium">haz clic para seleccionar</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG, WEBP · Máx. 2 MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleInputChange}
            className="hidden"
          />
        </div>

        {/* Botón de subir — solo visible cuando hay archivo pendiente */}
        {logoFile && (
          <Button
            onClick={handleLogoUpload}
            disabled={uploadingLogo}
            className="w-full bg-[#C1643F] hover:bg-[#A8522F] text-white gap-2"
          >
            <Upload className="w-4 h-4" />
            {uploadingLogo ? "Subiendo..." : "Subir logo"}
          </Button>
        )}
      </div>
    </div>
  );
}
