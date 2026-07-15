"use client";

import { useActionState, useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, MapPin, Send, ShoppingBasket, Trash2 } from "lucide-react";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import {
  GuestCheckoutForm,
  type GuestCheckoutLine,
} from "@/components/catalog/guest-checkout-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitQbCatalogOrderAction } from "@/lib/qb-catalog/actions";
import { saveLocalCart, useLocalCart } from "@/hooks/use-local-cart";
import type {
  QbCatalogActionState,
  QbCatalogProduct,
  QbCustomerAccount,
  QbCustomerLocation,
  QbLocalCartItem,
} from "@/types/qb-catalog";

type PublicCheckoutProps = {
  products: QbCatalogProduct[];
  error?: string;
  account: QbCustomerAccount | null;
  locations: QbCustomerLocation[];
  hasAuthenticatedSession: boolean;
};

const initialState: QbCatalogActionState = { success: false };
let currentIdempotencyKey = "";

function subscribeToIdempotencyKey() {
  return () => undefined;
}

function getIdempotencyKey() {
  if (!currentIdempotencyKey) currentIdempotencyKey = crypto.randomUUID();
  return currentIdempotencyKey;
}

function useIdempotencyKey() {
  return useSyncExternalStore(subscribeToIdempotencyKey, getIdempotencyKey, () => "");
}

function quantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(value);
}

function CheckoutSuccess({ reference }: { reference?: string }) {
  useEffect(() => {
    currentIdempotencyKey = "";
    saveLocalCart([]);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border bg-background p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-14 text-emerald-700" />
        <h1 className="mt-4 text-2xl font-semibold">Pedido enviado y recibido para preparacion</h1>
        {reference ? (
          <p className="mt-4 rounded-md bg-muted px-4 py-3 font-mono text-lg font-semibold">
            {reference}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1">
            <Link href="/mi-cuenta">Ver mis pedidos</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href="/catalogo">Nuevo pedido</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

export function PublicCheckout({
  products,
  error,
  account,
  locations,
  hasAuthenticatedSession,
}: PublicCheckoutProps) {
  const [state, formAction, pending] = useActionState(submitQbCatalogOrderAction, initialState);
  const idempotencyKey = useIdempotencyKey();
  const cart = useLocalCart() as QbLocalCartItem[];
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const lines = cart.flatMap((item) => {
    const product = productMap.get(item.productId);
    if (!product) return [];
    const unit = product.allowedUnits.find((allowed) => allowed.id === item.allowedUnitId);
    if (!unit) return [];
    return [{ product, unit, item }];
  });
  const primaryLocation = locations.find((location) => location.isPrimary) ?? locations[0];
  const guestLines: GuestCheckoutLine[] = lines.map(({ product, unit, item }) => ({
    productId: item.productId,
    allowedUnitId: item.allowedUnitId,
    productName: product.name,
    unitLabel: unit.label,
    quantity: item.quantity,
    notes: item.notes,
  }));

  if (state.success) return <CheckoutSuccess reference={state.reference} />;

  function removeLine(productId: string) {
    saveLocalCart(cart.filter((item) => item.productId !== productId));
  }

  return (
    <main className="min-h-screen bg-stone-50 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <QbInsumosBrand variant="compact" showSubtitle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/catalogo">
              <ArrowLeft className="size-4" />
              Catalogo
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-lg border bg-background p-5">
          <div className="flex items-start gap-3">
            <ShoppingBasket className="mt-1 size-5 text-emerald-700" />
            <div>
              <h1 className="text-2xl font-semibold">Revisar pedido</h1>
              <p className="text-sm text-muted-foreground">
                {account ? account.fullName : "Elige cómo quieres confirmar tu pedido."}
              </p>
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {!account ? (
            hasAuthenticatedSession ? (
              <div className="mt-5 rounded-lg border bg-muted/40 p-5">
                <p className="font-medium">Esta sesión no corresponde a una cuenta de cliente.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Usa el acceso asignado a tu usuario. No enviaremos el carrito como pedido sin cuenta.
                </p>
                <Button asChild className="mt-4">
                  <Link href="/">Volver al inicio</Link>
                </Button>
              </div>
            ) : (
              <GuestCheckoutForm lines={guestLines} onRemove={removeLine} />
            )
          ) : !locations.length ? (
            <div className="mt-5 rounded-lg border bg-muted/40 p-5">
              <p className="font-medium">Agrega una ubicacion en tu cuenta.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                El pedido necesita una direccion o punto de entrega.
              </p>
              <Button asChild className="mt-4">
                <Link href="/mi-cuenta">Gestionar ubicaciones</Link>
              </Button>
            </div>
          ) : !lines.length ? (
            <div className="mt-5 rounded-lg border bg-muted/40 p-5">
              <p className="font-medium">Tu pedido esta vacio.</p>
              <Button asChild className="mt-4">
                <Link href="/catalogo">Volver al catalogo</Link>
              </Button>
            </div>
          ) : (
            <form action={formAction} className="mt-5 space-y-5">
              <input type="hidden" name="idempotency_key" value={idempotencyKey} />
              <input
                type="hidden"
                name="items"
                value={JSON.stringify(
                  lines.map(({ item }) => ({
                    productId: item.productId,
                    allowedUnitId: item.allowedUnitId,
                    quantity: item.quantity,
                    notes: item.notes ?? "",
                  })),
                )}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-[10000px] h-px w-px overflow-hidden"
              >
                <Label htmlFor="company-website">Sitio web</Label>
                <input id="company-website" name="company_website" tabIndex={-1} />
              </div>

              {state.message ? (
                <p
                  role={state.success ? "status" : "alert"}
                  className={`rounded-md p-3 text-sm ${
                    state.success ? "bg-emerald-50 text-emerald-800" : "bg-destructive/5 text-destructive"
                  }`}
                >
                  {state.message}
                </p>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="location-id">Ubicacion</Label>
                <select
                  id="location-id"
                  name="location_id"
                  defaultValue={primaryLocation?.id}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  required
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.label} - {location.address}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                {lines.map(({ product, unit, item }) => (
                  <article key={product.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {quantity(item.quantity)} {unit.label}
                        </p>
                        {item.notes ? <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p> : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeLine(product.id)}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Quitar {product.name}</span>
                      </Button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer-notes">Notas generales</Label>
                <Textarea id="customer-notes" name="customer_notes" rows={3} />
              </div>

              <Button type="submit" disabled={pending} className="h-11 w-full">
                <Send className="size-4" />
                {pending ? "Enviando..." : "Enviar pedido"}
              </Button>
            </form>
          )}
        </section>

        <aside className="rounded-lg border bg-background p-5 lg:sticky lg:top-5 lg:self-start">
          <div className="flex items-center gap-2">
            {account ? (
              <MapPin className="size-4 text-emerald-700" />
            ) : (
              <ShoppingBasket className="size-4 text-emerald-700" />
            )}
            <h2 className="font-semibold">{account ? "Ubicaciones" : "Resumen del pedido"}</h2>
          </div>
          {account && locations.length ? (
            <div className="mt-3 space-y-2">
              {locations.map((location) => (
                <div key={location.id} className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="font-medium">{location.label}</p>
                  <p className="text-muted-foreground">{location.address}</p>
                </div>
              ))}
            </div>
          ) : account ? (
            <p className="mt-3 text-sm text-muted-foreground">Sin ubicaciones activas.</p>
          ) : guestLines.length ? (
            <div className="mt-3 space-y-2">
              {guestLines.map((line) => (
                <div key={line.productId} className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="font-medium">{line.productName}</p>
                  <p className="text-muted-foreground">
                    {quantity(line.quantity)} {line.unitLabel}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Tu pedido está vacío.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
