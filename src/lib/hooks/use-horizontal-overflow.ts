"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export interface HorizontalOverflow {
  /** Hay contenido oculto a la izquierda. */
  canScrollLeft: boolean;
  /** Hay contenido oculto a la derecha. */
  canScrollRight: boolean;
  /** El contenido no cabe: hay algo que descubrir desplazándose. */
  hasOverflow: boolean;
}

/** Margen en píxeles para no encender la pista por un redondeo de subpíxel. */
const EPSILON = 2;

/**
 * Observa si un contenedor con scroll horizontal tiene contenido oculto y hacia
 * qué lado.
 *
 * Sirve para que la parrilla de horarios avise en móvil de que la semana sigue
 * a la derecha, en vez de dejar creer que el primer día es toda la semana.
 */
export function useHorizontalOverflow(
  ref: RefObject<HTMLElement | null>
): HorizontalOverflow {
  const [state, setState] = useState<HorizontalOverflow>({
    canScrollLeft: false,
    canScrollRight: false,
    hasOverflow: false,
  });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    setState({
      canScrollLeft: scrollLeft > EPSILON,
      canScrollRight: scrollLeft < maxScroll - EPSILON,
      hasOverflow: maxScroll > EPSILON,
    });
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    measure();
    el.addEventListener("scroll", measure, { passive: true });

    // El desbordamiento cambia al rotar el móvil, al cambiar el ancho de la
    // ventana y también al añadir o quitar filas de la tabla.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [ref, measure]);

  return state;
}
