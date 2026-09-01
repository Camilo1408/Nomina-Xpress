/**
 * Interpretación de una hora ESCRITA a mano, en formato de 12 horas.
 *
 * El selector de tres desplegables garantizaba el formato pero obligaba a tres
 * clics por hora; escribir es mucho más rápido cuando se arma un horario
 * entero. Aquí se acepta lo que la gente escribe de verdad y se normaliza:
 *
 *   "3"        → 3:00        "3:5"     → 3:05
 *   "300"      → 3:00        "1530"    → 3:30 p. m.
 *   "3:30"     → 3:30        "15:30"   → 3:30 p. m.
 *   "3pm"      → 3:00 p. m.  "3 p.m."  → 3:00 p. m.
 *   "12am"     → 12:00 a. m.
 *
 * El módulo es puro y no toca el DOM: todo lo que decide se puede probar.
 */

export type Meridiem = "AM" | "PM" | "";

export interface TypedTime {
  /** Hora en 12 h para mostrar en el campo: `"3:30"`. */
  display: string;
  /** a. m. / p. m. deducido de lo escrito, o `""` si no se pudo deducir. */
  meridiem: Meridiem;
  /** Hora en 24 h (`"15:30"`), o `""` si falta el a. m./p. m. */
  value: string;
}

/** Lo que se muestra cuando el campo está vacío. */
const EMPTY: TypedTime = { display: "", meridiem: "", value: "" };

/** `"15:30"` → `{ display: "3:30", meridiem: "PM" }`. */
export function fromValue24(value: string): TypedTime {
  if (!value) return EMPTY;
  const [rawH, rawM] = value.split(":");
  const h = Number(rawH);
  const m = Number(rawM);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return EMPTY;
  if (h < 0 || h > 23 || m < 0 || m > 59) return EMPTY;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return {
    display: `${h12}:${String(m).padStart(2, "0")}`,
    meridiem: h < 12 ? "AM" : "PM",
    value,
  };
}

/** Compone el `"HH:mm"` de 24 h. `""` si falta el a. m./p. m. */
export function toValue24(display: string, meridiem: Meridiem): string {
  if (!display || !meridiem) return "";
  const [rawH, rawM] = display.split(":");
  const h12 = Number(rawH);
  const m = Number(rawM);
  if (!Number.isInteger(h12) || !Number.isInteger(m)) return "";
  const h = h12 % 12;
  const h24 = meridiem === "PM" ? h + 12 : h;
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Interpreta el texto escrito por el usuario.
 *
 * `fallbackMeridiem` es el a. m./p. m. que ya tenía el campo: si el usuario
 * escribe solo "3", se conserva el que estuviera puesto en vez de perderlo.
 *
 * Devuelve `null` cuando el texto no es una hora reconocible, para que el campo
 * pueda avisar sin descartar lo que la persona escribió.
 */
export function parseTypedTime(
  raw: string,
  fallbackMeridiem: Meridiem = ""
): TypedTime | null {
  const text = raw.trim().toLowerCase();
  if (!text) return EMPTY;

  // a. m. / p. m. escrito de cualquier forma: "pm", "p.m.", "p. m.", "p"
  let meridiem: Meridiem = "";
  let rest = text;
  const suffix = text.match(/([ap])\s*\.?\s*m?\s*\.?$/);
  if (suffix) {
    meridiem = suffix[1] === "a" ? "AM" : "PM";
    rest = text.slice(0, suffix.index).trim();
  }

  // Solo quedan dígitos y, como mucho, un separador.
  const digits = rest.replace(/[^0-9]/g, "");
  if (!digits || digits.length > 4) return null;

  const hasSeparator = /[:.\s]/.test(rest);
  // Cuatro dígitos con cero delante ("0830") es notación de 24 horas, no una
  // hora ambigua: quien escribe el cero inicial está escribiendo 08:30.
  const esVeinticuatro = !hasSeparator && digits.length === 4 && digits[0] === "0";
  let h: number;
  let m: number;

  if (hasSeparator) {
    // "3:5" → 3:05 · "15:30" → 15:30
    const [rawH, rawM = "0"] = rest.split(/[:.\s]+/);
    h = Number(rawH.replace(/[^0-9]/g, ""));
    m = Number(rawM.replace(/[^0-9]/g, ""));
  } else if (digits.length <= 2) {
    // "3" → 3:00 · "15" → 15:00
    h = Number(digits);
    m = 0;
  } else {
    // "300" → 3:00 · "1530" → 15:30
    h = Number(digits.slice(0, digits.length - 2));
    m = Number(digits.slice(-2));
  }

  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (m > 59) return null;
  if (h > 23 || h < 0) return null;

  // Una hora de 13 a 23 solo puede ser p. m., y las 0 solo a. m.: lo escrito en
  // 24 horas manda sobre el sufijo, que en ese caso sería contradictorio.
  if (h > 12) {
    meridiem = "PM";
    h = h - 12;
  } else if (h === 0) {
    meridiem = "AM";
    h = 12;
  } else if (esVeinticuatro) {
    meridiem = "AM";
  } else if (!meridiem) {
    meridiem = fallbackMeridiem;
  }

  const display = `${h}:${String(m).padStart(2, "0")}`;
  return { display, meridiem, value: toValue24(display, meridiem) };
}
