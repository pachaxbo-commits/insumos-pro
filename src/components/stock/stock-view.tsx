"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Search, X, Package } from "lucide-react";

import { StockAdjustmentDialog } from "@/components/products/product-management";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  ProductCategory,
  ProductWithRelations,
  QbProductUnitSettings,
} from "@/types/products";

type StockViewProps = {
  products: ProductWithRelations[];
  categories: ProductCategory[];
  unitsMap: Record<string, string>;
  settingsMap: Record<string, QbProductUnitSettings>;
  movementHistory: Record<
    string,
    Array<{
      id: string;
      movement_type: string;
      quantity: number;
      stock_before: number;
      stock_after: number;
      reason: string;
      created_at: string;
      created_by: string | null;
      created_by_name: string | null;
    }>
  >;
  canManage: boolean;
};

const BATCH_SIZE = 48;

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function StockView({
  products,
  categories,
  unitsMap,
  settingsMap,
  movementHistory,
  canManage,
}: StockViewProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const observerTarget = useRef<HTMLDivElement>(null);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setVisibleCount(BATCH_SIZE);
  };

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    setVisibleCount(BATCH_SIZE);
  };

  const handleResetFilters = () => {
    setSearch("");
    setSelectedCategory("all");
    setVisibleCount(BATCH_SIZE);
  };

  // Categorías con conteos reales
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const catId = p.category_id || "none";
      counts.set(catId, (counts.get(catId) || 0) + 1);
    }
    return counts;
  }, [products]);

  // Lista ordenada y filtrada
  const filteredProducts = useMemo(() => {
    const query = normalize(search);

    return products
      .filter((product) => {
        // Filtro por categoría
        if (selectedCategory !== "all") {
          if (selectedCategory === "none") {
            if (product.category_id) return false;
          } else if (product.category_id !== selectedCategory) {
            return false;
          }
        }

        // Filtro por texto (nombre, categoría, sku)
        if (query) {
          const nameNorm = normalize(product.name);
          const catNorm = normalize(product.category?.name ?? "");
          const skuNorm = normalize(product.sku ?? "");
          if (
            !nameNorm.includes(query) &&
            !catNorm.includes(query) &&
            !skuNorm.includes(query)
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const stockA = Number(a.stock_current ?? 0);
        const stockB = Number(b.stock_current ?? 0);

        // 1. Stock > 0 primero, luego stock <= 0
        const hasStockA = stockA > 0 ? 1 : 0;
        const hasStockB = stockB > 0 ? 1 : 0;

        if (hasStockA !== hasStockB) {
          return hasStockB - hasStockA;
        }

        // 2. Orden alfabético dentro de cada grupo
        return a.name.localeCompare(b.name, "es");
      });
  }, [products, search, selectedCategory]);

  // Observer para scroll continuo automático sin botones
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredProducts.length));
        }
      },
      { rootMargin: "300px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [filteredProducts.length]);

  const displayedProducts = filteredProducts.slice(0, visibleCount);

  return (
    <div className="space-y-4">
      {/* Controles superiores: Buscador y Filtros */}
      <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 shadow-sm sm:p-4">
        {/* Buscador */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar por nombre o categoría de producto..."
            className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-10 pr-9 text-base focus-visible:bg-white sm:text-sm"
          />
          {search ? (
            <button
              type="button"
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Limpiar búsqueda"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {/* Chips de Categorías con scroll horizontal suave en móvil */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 text-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => handleCategoryChange("all")}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 font-medium transition-colors touch-manipulation",
              selectedCategory === "all"
                ? "bg-emerald-800 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            Todos ({products.length})
          </button>

          {categories.map((cat) => {
            const count = categoryCounts.get(cat.id) || 0;
            if (count === 0) return null;
            const isSelected = selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(cat.id)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 font-medium transition-colors touch-manipulation",
                  isSelected
                    ? "bg-emerald-800 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
              >
                {cat.name} ({count})
              </button>
            );
          })}

          {(categoryCounts.get("none") || 0) > 0 ? (
            <button
              type="button"
              onClick={() => handleCategoryChange("none")}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 font-medium transition-colors touch-manipulation",
                selectedCategory === "none"
                  ? "bg-emerald-800 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              )}
            >
              Sin categoría ({categoryCounts.get("none")})
            </button>
          ) : null}
        </div>

        {/* Resumen de resultados */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Mostrando {displayedProducts.length} de {filteredProducts.length} productos
            {filteredProducts.length !== products.length ? ` (filtrados de ${products.length})` : ""}
          </span>
          {search || selectedCategory !== "all" ? (
            <button
              type="button"
              onClick={handleResetFilters}
              className="font-medium text-emerald-700 underline hover:text-emerald-900"
            >
              Restablecer filtros
            </button>
          ) : null}
        </div>
      </div>

      {/* Grid Responsive de Cards */}
      {displayedProducts.length > 0 ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))] sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {displayedProducts.map((product) => {
            const config = settingsMap[product.id];
            const unit =
              unitsMap[
                config?.base_inventory_unit_id ??
                  config?.inventory_unit_id ??
                  config?.base_unit_id ??
                  ""
              ] ??
              product.unit?.abbreviation ??
              "—";

            const stockNum = Number(product.stock_current ?? 0);
            const hasStock = stockNum > 0;

            const statusLabel =
              product.stock_status === "ok"
                ? "Normal"
                : product.stock_status === "stock_bajo"
                  ? "Bajo"
                  : product.stock_status === "sin_stock"
                    ? "Sin stock"
                    : "Regularización pendiente";

            const statusClass =
              product.stock_status === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : product.stock_status === "stock_bajo"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : product.stock_status === "sin_stock"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-slate-200 bg-slate-50 text-slate-700";

            return (
              <div
                key={product.id}
                className={cn(
                  "flex flex-col justify-between rounded-xl border bg-white p-3.5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md",
                  hasStock ? "border-slate-200" : "border-slate-200/60 bg-slate-50/40 opacity-90",
                )}
              >
                {/* Parte superior: Categoría, Estado y Nombre completo */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-slate-500">
                      {product.category?.name ?? "Sin categoría"}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold", statusClass)}
                    >
                      {statusLabel}
                    </Badge>
                  </div>

                  {/* Nombre completo sin truncar */}
                  <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-900 break-words">
                    {product.name}
                  </h3>
                </div>

                {/* Parte inferior: Stock actual y Botón compacto de ajuste */}
                <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3">
                  <div>
                    <span className="text-[11px] font-medium text-slate-400">Stock actual</span>
                    <div className="flex items-baseline gap-1">
                      <span
                        className={cn(
                          "text-xl font-bold tabular-nums tracking-tight",
                          stockNum > 0
                            ? "text-emerald-700"
                            : stockNum === 0
                              ? "text-slate-600"
                              : "text-rose-700",
                        )}
                      >
                        {stockNum.toLocaleString("es-BO", { maximumFractionDigits: 3 })}
                      </span>
                      <span className="text-xs font-medium text-slate-500">{unit}</span>
                    </div>
                  </div>

                  {/* Acción compacta de ajuste con accesibilidad móvil */}
                  <div>
                    <StockAdjustmentDialog
                      product={product}
                      history={movementHistory[product.id] ?? []}
                      canManage={canManage}
                      compact
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Package className="size-10 text-slate-300" />
          <div>
            <p className="font-semibold text-slate-800">No se encontraron productos</p>
            <p className="mt-1 text-sm text-slate-500">
              Prueba cambiando el término de búsqueda o seleccionando otra categoría.
            </p>
          </div>
          {search || selectedCategory !== "all" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSelectedCategory("all");
              }}
              className="mt-2"
            >
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      )}

      {/* Sentinel invisible para scroll continuo progresivo */}
      {visibleCount < filteredProducts.length ? (
        <div ref={observerTarget} className="flex justify-center py-6 text-xs text-slate-400">
          Cargando más productos...
        </div>
      ) : null}
    </div>
  );
}
