"use client";

import { useActionState } from "react";
import { BadgeDollarSign, Save, Trash2 } from "lucide-react";

import { useActionToast } from "@/hooks/use-action-toast";
import { updateQbProductPricingAction } from "@/lib/products/actions";
import { formatNumber } from "@/lib/format";
import type {
  ProductWithRelations,
  QbProductUnitSettings,
  QbUnit,
} from "@/types/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionState = { success: boolean; message?: string };

const initialState: ActionState = { success: false };

function isCurrencyQuantityUnit(symbol?: string | null) {
  if (!symbol) return false;
  return ["BS", "BOB"].includes(
    symbol.trim().toUpperCase().replaceAll(".", ""),
  );
}

export function ProductPricingEditor({
  product,
  settings,
  units,
  canManage,
}: {
  product: ProductWithRelations;
  settings?: QbProductUnitSettings;
  units: QbUnit[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateQbProductPricingAction,
    initialState,
  );
  useActionToast(state);

  if (!settings) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Guarda primero las unidades del producto para poder registrar su precio.
      </div>
    );
  }

  const currentPrice = settings.base_sale_price;
  const currentPriceUnitId =
    settings.base_price_unit_id ?? settings.base_unit_id;
  const currentPriceUnit = units.find(
    (unit) => unit.id === currentPriceUnitId,
  );
  const baseUnit = units.find((unit) => unit.id === settings.base_unit_id);
  const inventoryUnitId =
    settings.base_inventory_unit_id ??
    settings.inventory_unit_id ??
    settings.base_unit_id;
  const inventoryUnit = units.find((unit) => unit.id === inventoryUnitId);
  const hasInvalidPhysicalUnit =
    !baseUnit ||
    !inventoryUnit ||
    isCurrencyQuantityUnit(baseUnit.symbol) ||
    isCurrencyQuantityUnit(inventoryUnit.symbol);
  const activeUnits = units.filter(
    (unit) =>
      (unit.is_active || unit.id === currentPriceUnitId) &&
      !isCurrencyQuantityUnit(unit.symbol),
  );

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
          <BadgeDollarSign className="size-4.5" />
        </span>
        <div>
          <p className="font-medium">Precio base para recibos</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentPrice !== null
              ? `Actual: ${formatNumber(currentPrice)} Bs por ${currentPriceUnit?.symbol ?? "unidad configurada"}.`
              : "Este producto todavía no tiene precio base."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {product.controls_actual_weight
              ? "Si seleccionas KG, LIBRA, ARROBA u otra unidad de peso, el recibo usará el peso real entregado."
              : "El precio se aplicará a la cantidad entregada en la unidad seleccionada."}
          </p>
        </div>
      </div>

      {hasInvalidPhysicalUnit ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Primero corrige la unidad física</p>
          <p className="mt-1">
            Este producto todavía usa “BS” o no tiene una unidad física completa.
            En el formulario superior selecciona KG, LIBRA, CUARTILLA, UNIDAD u
            otra medida real y guarda el producto. Después registra el precio.
          </p>
        </div>
      ) : null}

      {canManage ? (
        <form action={action} className="mt-4 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="product_id" value={product.id} />
          <input
            type="hidden"
            name="expected_price"
            value={currentPrice ?? ""}
          />
          <input
            type="hidden"
            name="expected_price_unit_id"
            value={currentPriceUnitId}
          />
          <input type="hidden" name="remove_price" value="false" />

          <div className="space-y-2">
            <Label htmlFor={`price-unit-${product.id}`}>
              1. ¿En qué unidad se entrega y cobra?
            </Label>
            <select
              id={`price-unit-${product.id}`}
              name="price_unit_id"
              defaultValue={currentPriceUnitId}
              required
              className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              {activeUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.symbol})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`base-price-${product.id}`}>
              2. ¿Cuál es el precio base por esa unidad?
            </Label>
            <Input
              id={`base-price-${product.id}`}
              name="new_price"
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              placeholder="0,00"
              required
              className="rounded-xl bg-white"
              disabled={hasInvalidPhysicalUnit}
            />
            <p className="text-xs text-muted-foreground">
              Ejemplo: LIBRA + 25 significa Bs 25 por libra.
            </p>
          </div>

          {currentPrice !== null ? (
            <label className="flex items-start gap-2 text-xs text-muted-foreground md:col-span-2">
              <input
                name="confirm_replacement"
                value="true"
                type="checkbox"
                required
                className="mt-0.5"
              />
              Confirmo que deseo reemplazar el precio actual.
            </label>
          ) : (
            <input
              type="hidden"
              name="confirm_replacement"
              value="false"
            />
          )}

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button
              type="submit"
              disabled={pending || hasInvalidPhysicalUnit}
              className="rounded-xl"
            >
              <Save className="size-4" />
              {pending ? "Guardando…" : "Guardar precio"}
            </Button>
            {currentPrice !== null ? (
              <Button
                type="submit"
                name="remove_price"
                value="true"
                formNoValidate
                variant="outline"
                disabled={pending}
                className="rounded-xl text-rose-700 hover:text-rose-800"
              >
                <Trash2 className="size-4" />
                Retirar precio
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Solo el administrador puede modificar precios.
        </p>
      )}
    </section>
  );
}
