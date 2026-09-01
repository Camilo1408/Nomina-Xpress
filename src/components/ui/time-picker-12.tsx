"use client";

/**
 * Selector de hora en formato de 12 horas.
 *
 * El restaurante razona en 12 horas, pero todo lo que cruza la API y la base de
 * datos sigue siendo `"HH:mm"` de 24 horas: este componente recibe y emite 24
 * horas, y las 12 horas viven solo en lo que ve el usuario.
 *
 * Son tres `<select>` nativos en vez de un `<input type="time">` porque el
 * input nativo elige el formato según el idioma del navegador — en un equipo en
 * inglés mostraría 24 horas. Y en vez de un popover custom, porque los select
 * nativos ya funcionan con teclado y con el selector de rueda del móvil.
 */

import { useId } from "react";

interface TimePicker12Props {
  /** Hora en formato 24 h (`"15:00"`), o `""` si aún no hay valor. */
  value: string;
  /** Recibe la hora en formato 24 h, o `""` mientras la selección esté incompleta. */
  onChange: (value: string) => void;
  /** Etiqueta accesible del grupo (p. ej. "Hora de entrada, lunes"). */
  ariaLabel: string;
  /** Variante visual: el segundo turno se pinta con el acento del sistema. */
  accent?: boolean;
  disabled?: boolean;
}

interface Parts {
  hour12: string;
  minute: string;
  meridiem: "AM" | "PM" | "";
}

const EMPTY: Parts = { hour12: "", minute: "", meridiem: "" };

/** `"15:30"` → `{ hour12: "3", minute: "30", meridiem: "PM" }` */
export function parse24(value: string): Parts {
  if (!value) return EMPTY;
  const [rawH, rawM] = value.split(":");
  const h = Number(rawH);
  const m = Number(rawM);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return EMPTY;
  if (h < 0 || h > 23 || m < 0 || m > 59) return EMPTY;
  return {
    hour12: String(h % 12 === 0 ? 12 : h % 12),
    minute: String(m).padStart(2, "0"),
    meridiem: h < 12 ? "AM" : "PM",
  };
}

/** `{ hour12: "3", minute: "30", meridiem: "PM" }` → `"15:30"`. `""` si falta algo. */
export function build24(parts: Parts): string {
  const { hour12, minute, meridiem } = parts;
  if (!hour12 || !minute || !meridiem) return "";
  const h = Number(hour12) % 12;
  const h24 = meridiem === "PM" ? h + 12 : h;
  return `${String(h24).padStart(2, "0")}:${minute}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export function TimePicker12({
  value,
  onChange,
  ariaLabel,
  accent = false,
  disabled = false,
}: TimePicker12Props) {
  const groupId = useId();
  const parts = parse24(value);

  // Un minuto guardado fuera de los pasos de 5 (por ejemplo "15:07", capturado
  // antes de este cambio) tiene que seguir siendo seleccionable, o al editar el
  // turno se perdería en silencio.
  const minuteOptions = parts.minute && !MINUTES.includes(parts.minute)
    ? [...MINUTES, parts.minute].sort()
    : MINUTES;

  function update(patch: Partial<Parts>) {
    onChange(build24({ ...parts, ...patch }));
  }

  const border = accent ? "border-[#C1643F]/40" : "border-[#E0D5CA]";
  const bg = accent ? "bg-[#FDF5F2]" : "bg-white";
  const selectClass =
    `min-w-0 rounded border ${border} ${bg} px-1 py-0.5 text-xs text-[#2C1F15] ` +
    "focus:outline-none focus:border-[#C1643F] disabled:opacity-50 " +
    "disabled:cursor-not-allowed";

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center gap-0.5"
    >
      <select
        id={`${groupId}-h`}
        aria-label={`${ariaLabel}: hora`}
        value={parts.hour12}
        onChange={(e) => update({ hour12: e.target.value })}
        disabled={disabled}
        className={`${selectClass} flex-[1.1]`}
      >
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>

      <span aria-hidden className="text-[10px] text-[#7A6358]">
        :
      </span>

      <select
        id={`${groupId}-m`}
        aria-label={`${ariaLabel}: minutos`}
        value={parts.minute}
        onChange={(e) => update({ minute: e.target.value })}
        disabled={disabled}
        className={`${selectClass} flex-[1.1]`}
      >
        <option value="">--</option>
        {minuteOptions.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <select
        id={`${groupId}-ap`}
        aria-label={`${ariaLabel}: a. m. o p. m.`}
        value={parts.meridiem}
        onChange={(e) => update({ meridiem: e.target.value as Parts["meridiem"] })}
        disabled={disabled}
        className={`${selectClass} flex-[1.3]`}
      >
        <option value="">--</option>
        <option value="AM">a.m.</option>
        <option value="PM">p.m.</option>
      </select>
    </div>
  );
}
