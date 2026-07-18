"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ProductComboboxOption = {
  id: string;
  name: string;
  category?: string | null;
  unit?: string | null;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function ProductCombobox({
  options,
  value,
  onValueChange,
  name,
  disabled,
  placeholder = "Buscar producto",
  ariaLabel = "Producto",
  maxResults = 8,
}: {
  options: ProductComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  maxResults?: number;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value) ?? null;
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  const matches = useMemo(() => {
    const needle = normalizeSearch(query);
    return options
      .filter((option) =>
        !needle
        || normalizeSearch(`${option.name} ${option.category ?? ""} ${option.unit ?? ""}`).includes(needle),
      )
      .slice(0, maxResults);
  }, [maxResults, options, query]);

  function choose(option: ProductComboboxOption) {
    onValueChange(option.id);
    setQuery(option.name);
    setOpen(false);
    setActiveIndex(0);
  }

  return (
    <div ref={rootRef} className="relative">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
      <Input
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-autocomplete="list"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        className="rounded-xl pl-9"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
          if (value) onValueChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => Math.min(current + 1, Math.max(matches.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter" && open && matches[activeIndex]) {
            event.preventDefault();
            choose(matches[activeIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && !disabled ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {matches.length ? matches.map((option, index) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                index === activeIndex ? "bg-accent" : "hover:bg-accent/70",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              <Check className={cn("size-4", option.id === value ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{option.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[option.category, option.unit].filter(Boolean).join(" · ") || "Sin categoría ni unidad"}
                </span>
              </span>
            </button>
          )) : (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No se encontró el producto</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
