"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import type { ProductCategory, ProductFilters } from "@/types/products";

const selectClassName =
  "flex h-10 w-full rounded-xl border border-input bg-white/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

export function ProductFiltersBar({
  categories,
  filters,
}: {
  categories: ProductCategory[];
  filters: ProductFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(filters.q ?? "");
  const [isPending, startTransition] = useTransition();

  const replaceParameter = useCallback(
    (name: string, value: string, defaultValue = "all") => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      if (!value || value === defaultValue) params.delete(name);
      else params.set(name, value);
      startTransition(() => {
        const queryString = params.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const normalizedQuery = query.trim();
    const currentQuery = searchParams.get("q") ?? "";
    if (normalizedQuery === currentQuery) return;

    const timer = window.setTimeout(() => {
      replaceParameter("q", normalizedQuery, "");
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query, replaceParameter, searchParams]);

  return (
    <div className="grid gap-3 lg:grid-cols-[1.3fr_0.8fr_0.7fr_0.7fr_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre o SKU"
          aria-label="Buscar productos"
          className="h-10 rounded-xl pl-10"
        />
      </div>
      <select
        aria-label="Filtrar por categoría"
        value={filters.category ?? "all"}
        onChange={(event) => replaceParameter("category", event.target.value)}
        className={selectClassName}
      >
        <option value="all">Todas las categorías</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrar por estado"
        value={filters.status ?? "all"}
        onChange={(event) => replaceParameter("status", event.target.value)}
        className={selectClassName}
      >
        <option value="all">Todos</option>
        <option value="active">Activos</option>
        <option value="inactive">Inactivos</option>
      </select>
      <select
        aria-label="Filtrar por inventario"
        value={filters.stock ?? "all"}
        onChange={(event) => replaceParameter("stock", event.target.value)}
        className={selectClassName}
      >
        <option value="all">Todo stock</option>
        <option value="low">Stock bajo</option>
      </select>
      <span
        aria-live="polite"
        className="flex h-10 items-center text-xs text-muted-foreground"
      >
        {isPending ? "Actualizando…" : "Búsqueda automática"}
      </span>
    </div>
  );
}
