"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  LogOut,
  PackageCheck,
  RefreshCcw,
  Star,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { CustomerLocationsManager } from "@/components/customer-account/customer-locations-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveLocalCart } from "@/hooks/use-local-cart";
import { customerLogoutAction } from "@/lib/customer-account/actions";
import { updateQbCustomerProfileAction } from "@/lib/qb-catalog/actions";
import type {
  QbCatalogActionState,
  QbCatalogProduct,
  QbCustomerAccount,
  QbCustomerLocation,
  QbCustomerOrder,
  QbFrequentProduct,
  QbLocalCartItem,
} from "@/types/qb-catalog";

const initialState: QbCatalogActionState = { success: false };

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("es-BO", { day: "2-digit", month: "short" });
}

function quantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(value);
}

function orderStatusLabel(status: string) {
  if (status === "cancelado") return "Cancelado";
  if (status === "en_preparacion") return "En preparacion";
  if (status === "preparado") return "Preparado";
  if (status === "entregado_pendiente_recibo") return "Entregado";
  if (status === "incluido_en_recibo_borrador") return "En recibo";
  if (status === "recibo_emitido") return "Recibo emitido";
  return "Pendiente preparacion";
}

export function CustomerPortal({
  account,
  locations,
  orders,
  catalogProducts,
  frequentProducts,
  error,
}: {
  account: QbCustomerAccount;
  locations: QbCustomerLocation[];
  orders: QbCustomerOrder[];
  catalogProducts: QbCatalogProduct[];
  frequentProducts: QbFrequentProduct[];
  error?: string;
}) {
  const [profileState, profileAction, profilePending] = useActionState(
    updateQbCustomerProfileAction,
    initialState,
  );
  const productMap = new Map(catalogProducts.map((product) => [product.id, product]));
  const lastOrder = orders.find((order) => order.status !== "cancelado");
  const frequentCatalogProducts = frequentProducts
    .map((item) => productMap.get(item.productId))
    .filter((product): product is QbCatalogProduct => Boolean(product))
    .slice(0, 6);

  function repeatOrder(order: QbCustomerOrder) {
    const nextCart = order.items.flatMap<QbLocalCartItem>((item) => {
      const product = productMap.get(item.productId);
      if (!product) return [];
      const allowedUnit = product.allowedUnits.find((unit) => unit.id === item.allowedUnitId);
      if (!allowedUnit) return [];

      if (item.inputMode === "amount_bs") {
        if (!product.amountBsAvailable || !item.requestedAmountBs) return [];
        return [{
          productId: product.id,
          allowedUnitId: allowedUnit.id,
          quantity: allowedUnit.minQuantity,
          inputMode: "amount_bs",
          requestedAmountBs: item.requestedAmountBs,
          notes: item.notes ?? undefined,
        }];
      }

      const quantityValue = Math.max(item.requestedQuantity, allowedUnit.minQuantity);
      return [{
        productId: product.id,
        allowedUnitId: allowedUnit.id,
        quantity: Math.round(quantityValue * 1000) / 1000,
        notes: item.notes ?? undefined,
      }];
    });

    if (!nextCart.length) {
      toast.error("El ultimo pedido ya no tiene productos disponibles en el catalogo.");
      return;
    }

    saveLocalCart(nextCart);
    toast.success("Pedido cargado para editar.");
    window.location.assign("/catalogo");
  }

  function startFrequentProduct(product: QbCatalogProduct) {
    const unit = product.allowedUnits.find((item) => item.isDefault) ?? product.allowedUnits[0];
    if (!unit) return;
    saveLocalCart([{ productId: product.id, allowedUnitId: unit.id, quantity: unit.minQuantity }]);
    window.location.assign("/catalogo");
  }

  return (
    <main className="min-h-screen bg-stone-50 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <QbInsumosBrand variant="compact" showSubtitle />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/catalogo">Catálogo</Link>
            </Button>
            <form action={customerLogoutAction}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut className="size-4" />
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <section className="space-y-5">
          <div className="rounded-lg border bg-background p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Hola,</p>
                <h1 className="text-2xl font-semibold">{account.responsibleName}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{account.businessName}</p>
              </div>
              {lastOrder ? (
                <Button type="button" onClick={() => repeatOrder(lastOrder)}>
                  <RefreshCcw className="size-4" />
                  Repetir último pedido
                </Button>
              ) : null}
            </div>
            {error ? (
              <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border bg-background p-5">
            <div className="flex items-center gap-2">
              <Star className="size-5 text-emerald-700" />
              <h2 className="text-lg font-semibold">Productos frecuentes</h2>
            </div>
            {frequentCatalogProducts.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {frequentCatalogProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => startFrequentProduct(product)}
                    className="rounded-lg border bg-background p-3 text-left transition hover:bg-muted"
                  >
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {product.allowedUnits[0]?.label ?? "Unidad disponible"}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Aparecerán cuando tengas pedidos anteriores.
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-background p-5">
            <div className="flex items-center gap-2">
              <PackageCheck className="size-5 text-emerald-700" />
              <h2 className="text-lg font-semibold">Mis pedidos</h2>
            </div>

            {!orders.length ? (
              <div className="mt-4 rounded-lg border border-dashed p-8 text-center">
                <p className="font-medium">Aún no tienes pedidos.</p>
                <Button asChild className="mt-4">
                  <Link href="/catalogo">Ir al Catálogo</Link>
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {orders.map((order) => (
                  <article key={order.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-semibold">{order.reference}</p>
                        <p className="text-xs text-muted-foreground">{shortDate(order.submittedAt)}</p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        {orderStatusLabel(order.status)}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">{item.productName}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {item.inputMode === "amount_bs"
                              ? `Bs ${new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.requestedAmountBs ?? 0)}`
                              : `${quantity(item.requestedQuantity)} ${item.sourceLabel}`}
                          </span>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => repeatOrder(order)}
                    >
                      <RefreshCcw className="size-4" />
                      Repetir
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border bg-background p-5">
            <div className="flex items-center gap-2">
              <UserRound className="size-5 text-emerald-700" />
              <h2 className="text-lg font-semibold">Mis datos</h2>
            </div>
            {profileState.message ? (
              <p className={`mt-3 rounded-md p-3 text-sm ${profileState.success ? "bg-emerald-50 text-emerald-800" : "bg-destructive/5 text-destructive"}`}>
                {profileState.message}
              </p>
            ) : null}
            <form action={profileAction} className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="business-name">Nombre del negocio</Label>
                <Input
                  id="business-name"
                  name="business_name"
                  defaultValue={account.businessName}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="responsible-name">Nombre del responsable</Label>
                <Input
                  id="responsible-name"
                  name="responsible_name"
                  defaultValue={account.responsibleName}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">WhatsApp</Label>
                <Input id="phone" name="phone" defaultValue={account.phone ?? ""} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-email">Correo</Label>
                <Input id="customer-email" value={account.email} readOnly disabled />
              </div>
              <Button type="submit" disabled={profilePending} className="w-full">
                {profilePending ? "Guardando..." : "Guardar datos"}
              </Button>
            </form>
          </section>

          <CustomerLocationsManager locations={locations} />
        </aside>
      </div>
    </main>
  );
}
