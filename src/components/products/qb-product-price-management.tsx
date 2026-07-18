"use client";

import { useActionState, useMemo, useState } from "react";
import { BadgeDollarSign, Save, Search, Trash2 } from "lucide-react";

import { useActionToast } from "@/hooks/use-action-toast";
import { updateQbProductBasePriceAction } from "@/lib/products/actions";
import { formatNumber } from "@/lib/format";
import type {
  ProductWithRelations,
  QbProductAllowedUnit,
  QbProductUnitSettings,
  QbUnit,
} from "@/types/products";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ActionState = { success: boolean; message?: string };
type PriceStatus = "available" | "missing_price" | "invalid_unit" | "not_backed";

const initialState: ActionState = { success: false };

function PriceEditor({
  productId,
  currentPrice,
  canManagePrice,
}: {
  productId: string;
  currentPrice: number | null;
  canManagePrice: boolean;
}) {
  const [state, action, pending] = useActionState(updateQbProductBasePriceAction, initialState);
  useActionToast(state);

  if (!canManagePrice) return <span className="text-xs text-muted-foreground">Solo administrador</span>;

  return (
    <form action={action} className="min-w-56 space-y-2">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="expected_price" value={currentPrice ?? ""} />
      <input type="hidden" name="remove_price" value="false" />
      <div className="flex gap-2">
        <Input
          aria-label="Nuevo precio base"
          name="new_price"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0,00"
          required
          className="h-9 rounded-xl"
        />
        <Button type="submit" size="sm" disabled={pending} className="rounded-xl">
          <Save className="size-4" />
          Guardar
        </Button>
      </div>
      {currentPrice !== null ? (
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input name="confirm_replacement" value="true" type="checkbox" required className="mt-0.5" />
          Confirmo que deseo reemplazar el precio actual.
        </label>
      ) : (
        <input type="hidden" name="confirm_replacement" value="false" />
      )}
      {currentPrice !== null ? (
        <Button
          type="submit"
          name="remove_price"
          value="true"
          formNoValidate
          variant="ghost"
          size="sm"
          disabled={pending}
          className="h-8 rounded-xl text-rose-700 hover:text-rose-800"
        >
          <Trash2 className="size-3.5" />
          Retirar precio
        </Button>
      ) : null}
    </form>
  );
}

export function QbProductPriceManagement({
  products,
  settings,
  units,
  allowedUnits,
  canManagePrice,
}: {
  products: ProductWithRelations[];
  settings: QbProductUnitSettings[];
  units: QbUnit[];
  allowedUnits: QbProductAllowedUnit[];
  canManagePrice: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<PriceStatus | "all">("all");
  const settingsByProduct = useMemo(() => new Map(settings.map((item) => [item.product_id, item])), [settings]);
  const unitsById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const activePricingUnits = useMemo(
    () => new Set(allowedUnits.filter((item) => item.is_active && item.usage_context === "pedido" && item.unit_id).map((item) => `${item.product_id}:${item.unit_id}`)),
    [allowedUnits],
  );

  const statusFor = (product: ProductWithRelations): PriceStatus => {
    const item = settingsByProduct.get(product.id);
    if (!item?.supports_amount_bs) return "not_backed";
    const pricingUnit = item.base_price_unit_id ? unitsById.get(item.base_price_unit_id) : undefined;
    if (!pricingUnit?.is_active || !activePricingUnits.has(`${product.id}:${pricingUnit.id}`)) return "invalid_unit";
    if (!item.base_sale_price || item.base_sale_price <= 0) return "missing_price";
    return "available";
  };

  const categories = [...new Set(products.map((product) => product.category?.name).filter(Boolean) as string[])].sort();
  const visibleProducts = products.filter((product) => {
    const text = `${product.name} ${product.sku ?? ""}`.toLocaleLowerCase("es");
    return text.includes(query.trim().toLocaleLowerCase("es"))
      && (category === "all" || product.category?.name === category)
      && (status === "all" || statusFor(product) === status);
  });

  const counts = {
    total: products.length,
    positive: products.filter((product) => (settingsByProduct.get(product.id)?.base_sale_price ?? 0) > 0).length,
    available: products.filter((product) => statusFor(product) === "available").length,
    missing: products.filter((product) => settingsByProduct.get(product.id)?.base_sale_price == null).length,
    receiving: new Set(allowedUnits.filter((item) => item.is_active && item.usage_context === "recepcion").map((item) => item.product_id)).size,
    negativeStock: products.filter((product) => Number(product.stock_current) < 0).length,
  };

  const labels: Record<PriceStatus, string> = {
    available: "Disponible para pedidos por Bs",
    missing_price: "Bloqueado por precio",
    invalid_unit: "Bloqueado por unidad",
    not_backed: "No respaldado por modalidad BS",
  };

  return (
    <Card className="border-white/60 bg-card/92 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-xl"><BadgeDollarSign className="size-5" />Precios y preparación operativa</CardTitle>
        <CardDescription>Los precios son internos. Un precio positivo habilita pedidos por Bs solo cuando el producto y su unidad cumplen el contrato QB-17.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Publicados", counts.total], ["Con precio", counts.positive], ["Habilitados por Bs", counts.available],
            ["Sin precio", counts.missing], ["Con recepción", counts.receiving], ["Stock negativo", counts.negativeStock],
          ].map(([label, value]) => <div key={label} className="rounded-2xl border bg-white/70 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Label className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto" className="rounded-xl pl-9" /></Label>
          <select aria-label="Filtrar por categoría" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-xl border bg-white px-3 text-sm"><option value="all">Todas las categorías</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value as PriceStatus | "all")} className="h-10 rounded-xl border bg-white px-3 text-sm"><option value="all">Todos los estados</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
        <div className="overflow-x-auto rounded-2xl border">
          <Table><TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Unidad física</TableHead><TableHead>Unidad de precio</TableHead><TableHead>Precio actual</TableHead><TableHead>Modalidad BS</TableHead><TableHead>Estado QB-17</TableHead><TableHead>Actualizar</TableHead></TableRow></TableHeader>
            <TableBody>{visibleProducts.map((product) => { const item = settingsByProduct.get(product.id); const currentPrice = item?.base_sale_price ?? null; const priceUnit = item?.base_price_unit_id ? unitsById.get(item.base_price_unit_id) : undefined; const baseUnitId = item?.base_inventory_unit_id ?? item?.inventory_unit_id ?? item?.base_unit_id; const baseUnit = baseUnitId ? unitsById.get(baseUnitId) : undefined; const currentStatus = statusFor(product); return <TableRow key={product.id}><TableCell><p className="font-medium">{product.name}</p><p className="text-xs text-muted-foreground">{product.category?.name ?? "Sin categoría"}</p></TableCell><TableCell>{baseUnit?.symbol ?? "Sin configurar"}</TableCell><TableCell>{priceUnit?.symbol ?? "Sin configurar"}</TableCell><TableCell>{currentPrice !== null ? `${formatNumber(currentPrice)} Bs` : "Sin precio"}</TableCell><TableCell>{item?.supports_amount_bs ? "Sí" : "No"}</TableCell><TableCell><Badge variant="outline" className="whitespace-nowrap rounded-full">{labels[currentStatus]}</Badge></TableCell><TableCell><PriceEditor productId={product.id} currentPrice={currentPrice} canManagePrice={canManagePrice} /></TableCell></TableRow>; })}</TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">Sin stock conocido: {products.filter((product) => Number(product.stock_current) === 0).length}. Confirma el saldo mediante un ingreso de apertura trazable; no edites el saldo directamente.</p>
      </CardContent>
    </Card>
  );
}
