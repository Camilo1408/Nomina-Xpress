"use client";

/**
 * Campo de hora en formato de 12 horas que se puede ESCRIBIR.
 *
 * Volvemos a poder teclear la hora, como con el `<input type="time">` de antes,
 * pero sin depender del idioma del navegador para el formato: el campo se
 * escribe en 12 horas y el a. m./p. m. es un par de botones visibles.
 *
 * Se acepta lo que la gente escribe de verdad ("3", "300", "3:30", "3pm",
 * "15:30"); la interpretación vive en `@/lib/time-input-12`, que es puro y está
 * cubierto por tests.
 *
 * Igual que el resto del módulo, recibe y emite `"HH:mm"` de 24 horas: las 12
 * horas son solo presentación.
 */

import { useState } from "react";
import {
  fromValue24,
  parseTypedTime,
  toValue24,
  type Meridiem,
} from "@/lib/time-input-12";

interface TimeInput12Props {
  /** Hora en 24 h (`"15:00"`), o `""`. */
  value: string;
  /** Emite la hora en 24 h, o `""` mientras esté incompleta o sea inválida. */
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Variante visual para el 2.º turno. */
  accent?: boolean;
}

export function TimeInput12({
  value,
  onChange,
  ariaLabel,
  accent = false,
}: TimeInput12Props) {
  // Texto tal y como se está escribiendo: mientras el campo tiene el foco no se
  // reformatea, o se pelearía con quien teclea.
  const [text, setText] = useState(() => fromValue24(value).display);
  const [meridiem, setMeridiem] = useState<Meridiem>(
    () => fromValue24(value).meridiem
  );
  const [invalid, setInvalid] = useState(false);
  const [lastEmitted, setLastEmitted] = useState(value);

  if (value !== lastEmitted) {
    // El valor cambió desde fuera (se cargó un turno, se limpió la celda).
    const next = fromValue24(value);
    setText(next.display);
    setMeridiem(next.meridiem);
    setInvalid(false);
    setLastEmitted(value);
  }

  function emit(next: string) {
    setLastEmitted(next);
    onChange(next);
  }

  /** Al salir del campo se normaliza lo escrito: "300" pasa a verse "3:00". */
  function handleBlur() {
    const parsed = parseTypedTime(text, meridiem);
    if (!parsed) {
      setInvalid(true);
      emit("");
      return;
    }
    setInvalid(false);
    setText(parsed.display);
    setMeridiem(parsed.meridiem);
    emit(parsed.value);
  }

  function handleChange(raw: string) {
    setText(raw);
    // Se emite en vivo si ya se entiende, para no perder lo escrito si el admin
    // guarda sin sacar el foco del campo.
    const parsed = parseTypedTime(raw, meridiem);
    if (parsed) {
      setInvalid(false);
      if (parsed.meridiem) setMeridiem(parsed.meridiem);
      emit(parsed.value);
    } else {
      setInvalid(true);
      emit("");
    }
  }

  function setAmPm(next: Meridiem) {
    setMeridiem(next);
    const parsed = parseTypedTime(text, next);
    emit(parsed ? toValue24(parsed.display, next) : "");
  }

  const borderColor = invalid
    ? "border-[#B94040]"
    : accent
      ? "border-[#C1643F]/40"
      : "border-[#E0D5CA]";
  const bg = accent ? "bg-[#FDF5F2]" : "bg-white";

  const pill = (target: Exclude<Meridiem, "">, label: string) => {
    const on = meridiem === target;
    return (
      <button
        type="button"
        aria-label={`${ariaLabel}: ${label}`}
        aria-pressed={on}
        onClick={() => setAmPm(target)}
        className={`px-1.5 py-0.5 text-[10px] leading-tight transition-colors ${
          on
            ? "bg-[#C1643F] text-[#FAF7F2]"
            : "bg-white text-[#7A6358] hover:bg-[#F2EDE6]"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        placeholder="0:00"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className={`w-14 min-w-0 rounded border ${borderColor} ${bg} px-1.5 py-1 text-xs text-[#2C1F15] tabular-nums focus:outline-none focus:border-[#C1643F]`}
      />
      <div className="flex overflow-hidden rounded border border-[#E0D5CA]">
        {pill("AM", "a.m.")}
        <span aria-hidden className="w-px bg-[#E0D5CA]" />
        {pill("PM", "p.m.")}
      </div>
    </div>
  );
}
