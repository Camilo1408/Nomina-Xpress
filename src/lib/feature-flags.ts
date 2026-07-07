// Punto único para leer feature flags de despliegue (por cliente, vía env vars).
//
// Convención de nombres:
//   - NEXT_PUBLIC_FEATURE_*   → flags que el bundle de cliente necesita leer.
//   - sin prefijo NEXT_PUBLIC → flags server-only.
//
// Hoy el único flag es el de inventario, derivado de NEXT_PUBLIC_INVENTARIO_APP_URL:
// si está definida (y no vacía), el módulo de inventario (enlaces, sync, controles
// de permisos) se activa en todo el UI. Si no, queda oculto con el código intacto
// y reactivable sin cambios de código. Se configura por proyecto en Vercel.
export function isInventoryEnabled(): boolean {
  const url = process.env.NEXT_PUBLIC_INVENTARIO_APP_URL;
  return typeof url === "string" && url.trim().length > 0;
}
