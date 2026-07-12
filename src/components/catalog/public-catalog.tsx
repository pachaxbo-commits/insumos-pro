"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  Minus,
  PackagePlus,
  Search,
  ShoppingBasket,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { saveLocalCart, useLocalCart } from "@/hooks/use-local-cart";
import { cn } from "@/lib/utils";
import type {
  QbCatalogCategory,
  QbCatalogProduct,
  QbLocalCartItem,
} from "@/types/qb-catalog";

type PublicCatalogProps = {
  products: QbCatalogProduct[];
  categories: QbCatalogCategory[];
  error?: string;
};

type CartLine = {
  product: QbCatalogProduct;
  item: QbLocalCartItem;
};

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-BO", {
    maximumFractionDigits: 3,
  }).format(value);
}

function getDefaultUnit(product: QbCatalogProduct) {
  return product.allowedUnits.find((unit) => unit.isDefault) ?? product.allowedUnits[0];
}

function normalizeQuantity(product: QbCatalogProduct, allowedUnitId: string, value: number) {
  const unit = product.allowedUnits.find((item) => item.id === allowedUnitId) ?? getDefaultUnit(product);
  if (!unit || !Number.isFinite(value)) return 1;

  const min = unit.minQuantity;
  const step = unit.quantityStep;
  const clamped = Math.max(value, min);
  const steps = Math.round((clamped - min) / step);
  return roundQuantity(min + Math.max(0, steps) * step);
}

function ProductImage({ product }: { product: QbCatalogProduct }) {
  if (!product.imageUrl) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-100 text-stone-400">
        <PackagePlus className="size-10" />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={product.name}
      className="h-full bg-cover bg-center"
      style={{ backgroundImage: `url("${product.imageUrl}")` }}
    />
  );
}

function CartSummary({
  lines,
  onRemove,
  onClear,
}: {
  lines: CartLine[];
  onRemove: (productId: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!lines.length ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <ShoppingBasket className="size-10 text-emerald-700" />
          <p className="mt-3 text-base font-semibold">Tu pedido esta vacio</p>
          <p className="mt-1 text-sm text-muted-foreground">Agrega productos del catalogo.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto py-2">
            {lines.map(({ product, item }) => {
              const unit = product.allowedUnits.find((allowed) => allowed.id === item.allowedUnitId);

              return (
                <article key={product.id} className="rounded-lg border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatQuantity(item.quantity)} {unit?.label ?? ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => onRemove(product.id)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Quitar {product.name}</span>
                    </Button>
                  </div>
                  {item.notes ? (
                    <p className="mt-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {item.notes}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className="border-t pt-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{lines.length} productos</span>
              <button type="button" className="font-medium text-destructive" onClick={onClear}>
                Vaciar
              </button>
            </div>
            <Button asChild className="mt-3 h-11 w-full">
              <Link href="/catalogo/checkout">
                Revisar pedido
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function PublicCatalog({ products, categories, error }: PublicCatalogProps) {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("es"));
  const cart = useLocalCart() as QbLocalCartItem[];
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cartLines = cart.flatMap<CartLine>((item) => {
    const product = productMap.get(item.productId);
    if (!product) return [];
    const unit = product.allowedUnits.some((allowed) => allowed.id === item.allowedUnitId)
      ? item.allowedUnitId
      : getDefaultUnit(product)?.id;
    if (!unit) return [];
    return [{ product, item: { ...item, allowedUnitId: unit } }];
  });

  const filteredProducts = products.filter((product) => {
    const categoryMatches = category === "all" || product.categorySlug === category;
    const textMatches =
      !deferredSearch ||
      product.name.toLocaleLowerCase("es").includes(deferredSearch) ||
      product.description?.toLocaleLowerCase("es").includes(deferredSearch);
    return categoryMatches && textMatches;
  });

  function persist(nextCart: QbLocalCartItem[]) {
    if (!saveLocalCart(nextCart)) {
      toast.error("No pudimos guardar el pedido en este navegador.");
    }
  }

  function updateProduct(product: QbCatalogProduct, values: Partial<QbLocalCartItem>) {
    const defaultUnit = getDefaultUnit(product);
    if (!defaultUnit) return;

    const current = cart.find((item) => item.productId === product.id);
    const allowedUnitId = values.allowedUnitId ?? current?.allowedUnitId ?? defaultUnit.id;
    const quantity = normalizeQuantity(
      product,
      allowedUnitId,
      values.quantity ?? current?.quantity ?? defaultUnit.minQuantity,
    );
    const notes = values.notes ?? current?.notes ?? "";
    const nextItem: QbLocalCartItem = {
      productId: product.id,
      allowedUnitId,
      quantity,
      notes: notes.trim() || undefined,
    };
    const exists = cart.some((item) => item.productId === product.id);
    persist(exists ? cart.map((item) => (item.productId === product.id ? nextItem : item)) : [...cart, nextItem]);
  }

  function removeProduct(productId: string) {
    persist(cart.filter((item) => item.productId !== productId));
  }

  return (
    <main className="min-h-screen bg-stone-50 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <QbInsumosBrand variant="compact" showSubtitle />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/mi-cuenta">
                <UserRound className="size-4" />
                Mi cuenta
              </Link>
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button size="sm">
                  <ShoppingBasket className="size-4" />
                  {cartLines.length}
                </Button>
              </SheetTrigger>
              <SheetContent className="flex w-full flex-col sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Pedido</SheetTitle>
                </SheetHeader>
                <CartSummary
                  lines={cartLines}
                  onRemove={removeProduct}
                  onClear={() => persist([])}
                />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <section className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar producto"
                className="h-11 pl-9"
              />
            </div>
          </div>

          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Categorias">
            <Button
              type="button"
              size="sm"
              variant={category === "all" ? "default" : "outline"}
              onClick={() => setCategory("all")}
            >
              Todos
            </Button>
            {categories.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={category === item.slug ? "default" : "outline"}
                onClick={() => setCategory(item.slug)}
              >
                {item.name}
              </Button>
            ))}
          </nav>

          {error ? (
            <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
              {error}
            </div>
          ) : !filteredProducts.length ? (
            <div className="mt-5 rounded-lg border bg-background p-8 text-center">
              <p className="font-medium">No hay productos disponibles.</p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const current = cartLines.find((line) => line.product.id === product.id)?.item;
                const selectedUnitId = current?.allowedUnitId ?? getDefaultUnit(product)?.id ?? "";
                const selectedUnit = product.allowedUnits.find((unit) => unit.id === selectedUnitId);
                const quantity = current?.quantity ?? selectedUnit?.minQuantity ?? 1;

                return (
                  <article key={product.id} className="overflow-hidden rounded-lg border bg-background">
                    <div className="aspect-[4/3]">
                      <ProductImage product={product} />
                    </div>
                    <div className="space-y-3 p-4">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium uppercase text-muted-foreground">
                            {product.categoryName ?? "Catalogo"}
                          </p>
                          {product.isFrequent ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Frecuente
                            </span>
                          ) : null}
                        </div>
                        <h2 className="mt-1 text-lg font-semibold leading-snug">{product.name}</h2>
                        {product.description ? (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {product.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`unit-${product.id}`}>Unidad</Label>
                        <select
                          id={`unit-${product.id}`}
                          value={selectedUnitId}
                          onChange={(event) =>
                            updateProduct(product, { allowedUnitId: event.target.value })
                          }
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        >
                          {product.allowedUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={!selectedUnit || quantity <= selectedUnit.minQuantity}
                          onClick={() =>
                            updateProduct(product, {
                              quantity: quantity - (selectedUnit?.quantityStep ?? 1),
                            })
                          }
                        >
                          <Minus className="size-4" />
                        </Button>
                        <div className="space-y-2">
                          <Label htmlFor={`qty-${product.id}`}>Cantidad</Label>
                          <Input
                            id={`qty-${product.id}`}
                            type="number"
                            min={selectedUnit?.minQuantity ?? 1}
                            step={selectedUnit?.quantityStep ?? 1}
                            value={quantity}
                            onChange={(event) =>
                              updateProduct(product, { quantity: Number(event.target.value) })
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            updateProduct(product, {
                              quantity: quantity + (selectedUnit?.quantityStep ?? 1),
                            })
                          }
                        >
                          <PackagePlus className="size-4" />
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`notes-${product.id}`}>Observacion</Label>
                        <Textarea
                          id={`notes-${product.id}`}
                          value={current?.notes ?? ""}
                          onChange={(event) => updateProduct(product, { notes: event.target.value })}
                          rows={2}
                        />
                      </div>

                      <Button
                        type="button"
                        variant={current ? "outline" : "default"}
                        className={cn("w-full", current ? "text-emerald-700" : "")}
                        onClick={() =>
                          updateProduct(product, {
                            quantity: current?.quantity ?? selectedUnit?.minQuantity ?? 1,
                          })
                        }
                      >
                        {current ? <Check className="size-4" /> : <ShoppingBasket className="size-4" />}
                        {current ? "Agregado" : "Agregar"}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="hidden min-h-[calc(100vh-7rem)] rounded-lg border bg-background p-4 lg:sticky lg:top-5 lg:flex lg:flex-col">
          <CartSummary
            lines={cartLines}
            onRemove={removeProduct}
            onClear={() => persist([])}
          />
        </aside>
      </div>
    </main>
  );
}
