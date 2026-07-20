"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, X, Search } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  /** Modo controlado: valor actual. Omitir para modo no controlado (usar defaultValue). */
  value?: string;
  /** Modo no controlado (p. ej. dentro de un <form> GET nativo). */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Si se define, se renderiza un <input type="hidden" name> para formularios nativos (GET). */
  name?: string;
  /** Texto del campo cuando no hay selección / placeholder del buscador. */
  placeholder?: string;
  /**
   * Opción "vacía" (p. ej. { value: "", label: "Todos" }). Si se define, aparece
   * arriba y permite limpiar la selección.
   */
  emptyOption?: SearchableOption;
  className?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Selector con búsqueda tipo combobox: permite escribir para filtrar las
 * opciones (sin importar mayúsculas/minúsculas ni acentos). Reutilizable en
 * filtros (auditoría, registro de horas, reportes) y formularios.
 */
export function SearchableSelect({
  options,
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  name,
  placeholder = "Buscar…",
  emptyOption,
  className,
  id,
  disabled,
}: SearchableSelectProps) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  // Soporta modo controlado (value) y no controlado (defaultValue + estado interno).
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = isControlled ? controlledValue : internalValue;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allOptions = useMemo(
    () => (emptyOption ? [emptyOption, ...options] : options),
    [emptyOption, options]
  );

  const selected = allOptions.find((o) => o.value === value);
  const selectedLabel = selected?.label ?? "";

  // Normaliza para comparar sin distinguir mayúsculas/minúsculas ni acentos.
  // ̀-ͯ = marcas diacríticas combinantes (tildes) que NFD separa.
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return allOptions;
    return allOptions.filter((o) => normalize(o.label).includes(q));
  }, [query, allOptions]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function choose(opt: SearchableOption) {
    if (!isControlled) setInternalValue(opt.value);
    onValueChange?.(opt.value);
    setOpen(false);
    setQuery("");
  }

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setHighlight(0);
    // enfocar el input de búsqueda al abrir
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) choose(filtered[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value} />}

      <button
        type="button"
        id={fieldId}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-[#E0D5CA] bg-white px-2.5 py-1 text-sm text-left",
          "focus:outline-none focus:ring-2 focus:ring-[#C1643F]/30 disabled:opacity-50 disabled:cursor-not-allowed",
          selectedLabel ? "text-[#2C1F15]" : "text-[#7A6358]"
        )}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {emptyOption && value !== emptyOption.value && !disabled && (
            <X
              className="w-4 h-4 text-[#7A6358] hover:text-[#2C1F15]"
              onClick={(e) => {
                e.stopPropagation();
                choose(emptyOption);
              }}
            />
          )}
          <ChevronDown
            className={cn("w-4 h-4 text-[#7A6358] transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-[#E0D5CA] bg-white shadow-lg">
          <div className="relative border-b border-[#F2EDE6] p-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7A6358]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="w-full rounded-md border border-[#E0D5CA] bg-white pl-8 pr-2 py-1.5 text-sm text-[#2C1F15] focus:outline-none focus:ring-2 focus:ring-[#C1643F]/30"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.map((opt, i) => (
              <li key={opt.value || "__empty__"}>
                <button
                  type="button"
                  onClick={() => choose(opt)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "flex w-full items-center px-3 py-2 text-sm text-left",
                    i === highlight ? "bg-[#C1643F]/10 text-[#C1643F]" : "text-[#2C1F15]",
                    opt.value === value && "font-semibold"
                  )}
                >
                  {opt.label}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-sm text-[#7A6358] text-center">
                Sin resultados
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
