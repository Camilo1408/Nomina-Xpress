import {
  DAILY_ACTIONS,
  DAILY_ACTION_LABELS,
  DAILY_ACTION_DESCRIPTIONS,
} from "@/lib/permission-keys";

// Leyenda de ayuda para la matriz de permisos de inventario diario por categoría.
// Las 5 acciones (ver / abrir / cerrar / reabrir-editar / historial) se repiten
// por cada categoría, así que las explicamos UNA sola vez aquí en lugar de por
// cada checkbox. Colapsable (<details>) para no añadir altura por defecto.
//
// Sin estado ni handlers → no necesita "use client"; se renderiza dentro de los
// formularios cliente (RoleForm / UserPermissionsForm) como contenido estático.
export function InventoryDailyActionsLegend() {
  return (
    <details className="group px-4 py-2.5 bg-[#FAF7F2] border-t border-[#E0D5CA] text-sm">
      <summary className="cursor-pointer select-none text-xs font-medium text-[#7A6358] hover:text-[#2C1F15] transition-colors list-none marker:content-[''] [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[#C1643F] transition-transform group-open:rotate-90">▸</span>
          ¿Qué permite cada acción por categoría?
        </span>
      </summary>
      <dl className="mt-2.5 space-y-1.5">
        {DAILY_ACTIONS.map((action) => (
          <div key={action} className="flex gap-2">
            <dt className="text-[#2C1F15] font-medium whitespace-nowrap min-w-[6.5rem]">
              {DAILY_ACTION_LABELS[action]}
            </dt>
            <dd className="text-[#7A6358]">{DAILY_ACTION_DESCRIPTIONS[action]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-xs text-[#7A6358] italic">
        Tras cambiar estos permisos, el usuario debe cerrar sesión y volver a
        entrar para que apliquen.
      </p>
    </details>
  );
}
