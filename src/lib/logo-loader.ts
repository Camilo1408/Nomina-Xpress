import path from "path";
import fs from "fs/promises";

export type LogoFormat = "png" | "jpg";

export interface LoadedLogo {
  data: Buffer;
  format: LogoFormat;
}

function extractExt(urlOrPath: string): string {
  const clean = urlOrPath.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot === -1) return "";
  return clean.slice(dot + 1).toLowerCase();
}

function toLogoFormat(ext: string): LogoFormat | null {
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (ext === "png") return "png";
  // SVG/WEBP no soportados por @react-pdf/renderer ni ExcelJS de manera fiable.
  return null;
}

/**
 * Carga el logo del tenant como Buffer + formato.
 * - Si la URL es local (`/uploads/...`), lee el archivo desde `public/uploads/`.
 * - Si es remota (`https://...`), la descarga con fetch.
 * Devuelve null si no hay logo, el formato no se soporta, o la carga falla.
 */
export async function loadTenantLogo(logoUrl: string | null | undefined): Promise<LoadedLogo | null> {
  if (!logoUrl) return null;

  const ext = extractExt(logoUrl);
  const format = toLogoFormat(ext);
  if (!format) return null;

  try {
    if (logoUrl.startsWith("/uploads/")) {
      const filename = logoUrl.replace(/^\/+/, "").split("?")[0]; // "uploads/<file>"
      const abs = path.join(process.cwd(), "public", filename);
      const data = await fs.readFile(abs);
      return { data, format };
    }
    if (/^https?:\/\//.test(logoUrl)) {
      const res = await fetch(logoUrl);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return { data: Buffer.from(arr), format };
    }
    return null;
  } catch {
    return null;
  }
}
