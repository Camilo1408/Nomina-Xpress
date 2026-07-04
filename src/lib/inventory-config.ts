// Lever único para la integración con el módulo de inventario.
// El acceso al inventario (enlaces, sync, controles de permisos) se activa
// SOLO si se define NEXT_PUBLIC_INVENTARIO_APP_URL. En el despliegue demo la
// env no se define → inventario desactivado en todo el UI, con el código
// intacto y reactivable a futuro sin cambios de código.
export function isInventoryEnabled(): boolean {
  const url = process.env.NEXT_PUBLIC_INVENTARIO_APP_URL;
  return typeof url === "string" && url.trim().length > 0;
}
