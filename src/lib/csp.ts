// H10: Content-Security-Policy sin 'unsafe-inline' ni 'unsafe-eval' en los scripts.
//
// Cada petición de página recibe un nonce nuevo (lo genera `src/proxy.ts`). Solo corren
// los scripts que lo llevan, y los que esos scripts cargan ('strict-dynamic'): un script
// inyectado por un atacante no tiene el nonce y el navegador lo descarta.
//
// Next.js lee el nonce de la cabecera Content-Security-Policy de la petición y se lo pone
// a sus propios scripts; para eso la página debe renderizarse en cada petición (el layout
// raíz lee `x-nonce`, lo que ya lo garantiza).

/** Cabecera de la petición con la que el proxy entrega el nonce al layout raíz. */
export const NONCE_HEADER = "x-nonce";

interface CspOptions {
  /** Nonce de la petición. Sin él (API, archivos) no se permite ningún script en línea. */
  nonce?: string;
  /** En desarrollo React necesita `eval` para reconstruir las trazas de error. */
  dev?: boolean;
}

export function buildCsp({ nonce, dev = false }: CspOptions = {}): string {
  const script = ["'self'"];
  if (nonce) script.push(`'nonce-${nonce}'`, "'strict-dynamic'");
  if (dev) script.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    `script-src ${script.join(" ")}`,
    // Los estilos en línea siguen permitidos: los colores de cada cliente y varias
    // librerías de interfaz se aplican con atributos `style`.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "connect-src 'self'",
    // El service worker (/sw.js): con 'strict-dynamic' ya no lo cubre el 'self' de script-src.
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** Nonce aleatorio de 128 bits en base64, distinto en cada petición. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
