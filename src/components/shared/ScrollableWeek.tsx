"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useHorizontalOverflow } from "@/lib/hooks/use-horizontal-overflow";

interface ScrollableWeekProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Contenedor con scroll horizontal para las tablas de horario.
 *
 * Una tabla de 7 días no cabe en un teléfono, y sin una pista visual el
 * empleado ve el primer día y cree que esa es toda su semana. Aquí:
 *
 *   - sombras en los bordes que aparecen solo mientras queda algo por descubrir,
 *   - una pista "Desliza para ver los demás días", visible solo en móvil y solo
 *     si hay desbordamiento real.
 *
 * La columna fija (`sticky left-0`) la ponen las tablas, porque no todas tienen
 * columna de personal.
 */
export function ScrollableWeek({ children, className = "" }: ScrollableWeekProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { canScrollLeft, canScrollRight, hasOverflow } = useHorizontalOverflow(ref);

  return (
    <div className="relative">
      <div ref={ref} className={`overflow-x-auto ${className}`}>
        {children}
      </div>

      {/* Sombras de borde: señalan que el contenido continúa. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#2C1F15]/10 to-transparent transition-opacity duration-200 ${
          canScrollLeft ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#2C1F15]/10 to-transparent transition-opacity duration-200 ${
          canScrollRight ? "opacity-100" : "opacity-0"
        }`}
      />

      {hasOverflow && (
        <p className="sm:hidden flex items-center justify-center gap-1 pt-2 text-[11px] text-[#7A6358]">
          <ChevronLeft
            aria-hidden
            className={`w-3 h-3 transition-opacity ${canScrollLeft ? "opacity-100" : "opacity-25"}`}
          />
          Desliza para ver los demás días
          <ChevronRight
            aria-hidden
            className={`w-3 h-3 transition-opacity ${canScrollRight ? "opacity-100" : "opacity-25"}`}
          />
        </p>
      )}
    </div>
  );
}
