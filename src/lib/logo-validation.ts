// H9 / CP-51: el logo se valida por su contenido, no por el nombre del archivo.
//
// La extensión la elige quien sube el archivo; los primeros bytes no. Solo se aceptan
// formatos de mapa de bits: un SVG es un documento que puede llevar scripts y, en modo
// local, se sirve desde el mismo origen que la aplicación.

export type LogoImageType = "png" | "jpg" | "webp";

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

/** Formato real de la imagen según sus bytes iniciales, o `null` si no es uno aceptado. */
export function detectLogoType(bytes: Uint8Array): LogoImageType | null {
  if (startsWith(bytes, PNG)) return "png";
  if (startsWith(bytes, JPG)) return "jpg";
  // WEBP: contenedor RIFF con la marca "WEBP" en el byte 8.
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  return null;
}
