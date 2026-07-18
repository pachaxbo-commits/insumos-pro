"use client";

import { useActionState, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { ProductCombobox } from "@/components/products/product-combobox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/use-action-toast";
import { formatNumber } from "@/lib/format";
import { saveQbProductClassificationConfigurationAction } from "@/lib/products/actions";
import { cn } from "@/lib/utils";
import type {
  ProductWithRelations,
  QbClassificationProductOption,
  QbProductClassificationOutput,
  QbProductPresentation,
  QbProductUnitSettings,
  QbUnit,
} from "@/types/products";

type ActionState = { success: boolean; message?: string };

const initialState: ActionState = { success: false };

export function ProductClassificationConfiguration({
  sourceProduct,
  products,
  settings,
  presentations,
  outputs,
  units,
  canManage,
}: {
  sourceProduct: ProductWithRelations;
  products: QbClassificationProductOption[];
  settings?: QbProductUnitSettings;
  presentations: QbProductPresentation[];
  outputs: QbProductClassificationOutput[];
  units: QbUnit[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    saveQbProductClassificationConfigurationAction,
    initialState,
  );
  useActionToast(state);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const unitsById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units],
  );
  const sourceDimensionId = settings
    ? unitsById.get(settings.base_unit_id)?.dimension_id
    : undefined;
  const initialOutputIds = useMemo(
    () =>
      outputs
        .filter(
          (output) =>
            output.source_product_id === sourceProduct.id &&
            output.output_type === "product" &&
            output.output_product_id &&
            output.is_active,
        )
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((output) => output.output_product_id as string),
    [outputs, sourceProduct.id],
  );
  const [outputProductIds, setOutputProductIds] = useState(initialOutputIds);
  const [candidateId, setCandidateId] = useState("");

  const candidateProducts = products.filter((product) => {
    const candidateUnit = product.baseUnitId
      ? unitsById.get(product.baseUnitId)
      : undefined;
    return (
      product.id !== sourceProduct.id &&
      product.isActive &&
      product.isQbActive &&
      candidateUnit?.dimension_id === sourceDimensionId &&
      !outputProductIds.includes(product.id)
    );
  });

  const sourcePresentations = presentations
    .filter(
      (presentation) =>
        presentation.product_id === sourceProduct.id &&
        presentation.is_active &&
        presentation.allow_purchase,
    )
    .sort((a, b) => a.sort_order - b.sort_order);

  function addCandidate() {
    if (!candidateId || outputProductIds.includes(candidateId)) return;
    setOutputProductIds((current) => [...current, candidateId]);
    setCandidateId("");
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= outputProductIds.length) return;
    setOutputProductIds((current) => {
      const reordered = [...current];
      [reordered[index], reordered[target]] = [
        reordered[target],
        reordered[index],
      ];
      return reordered;
    });
  }

  const hasSourceWarning =
    sourceProduct.is_sellable !== false ||
    settings?.is_visible_in_qb_catalog ||
    !settings?.is_classifiable ||
    settings.classification_mode !== "percentage";

  return (
    <section className="space-y-4 border-t pt-5">
      <div>
        <h3 className="font-heading text-lg font-semibold">
          Recepción y clasificación
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Define los productos que recibirán el inventario después de clasificar
          este producto.
        </p>
      </div>

      {hasSourceWarning ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Configuración del producto incompleta</AlertTitle>
          <AlertDescription>
            Debe requerir clasificación porcentual, permanecer fuera del
            catálogo y no ser vendible. Corrige esos datos en el formulario
            superior antes de usarlo en Ingresos.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-2xl border bg-muted/25 p-4">
        <p className="text-sm font-medium">Presentaciones de recepción</p>
        {sourcePresentations.length ? (
          <div className="mt-2 space-y-2">
            {sourcePresentations.map((presentation) => {
              const containedUnit = unitsById.get(
                presentation.contained_unit_id,
              );
              const baseUnit = unitsById.get(presentation.base_unit_id);
              return (
                <div
                  key={presentation.id}
                  className="rounded-xl bg-background px-3 py-2 text-sm"
                >
                  <p className="font-medium">
                    1 {presentation.symbol.toLocaleLowerCase("es")} ={" "}
                    {formatNumber(presentation.contained_quantity)}{" "}
                    {containedUnit?.name.toLocaleLowerCase("es") ?? "unidades"}{" "}
                    = {formatNumber(presentation.conversion_factor_to_base)}{" "}
                    {baseUnit?.symbol ?? ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Equivalencia por unidad:{" "}
                    {formatNumber(presentation.base_quantity)}{" "}
                    {baseUnit?.symbol ?? ""}
                    {" · "}Total presentación:{" "}
                    {formatNumber(presentation.conversion_factor_to_base)}{" "}
                    {baseUnit?.symbol ?? ""}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-amber-700">
            Falta una presentación activa permitida para recepción.
          </p>
        )}
      </div>

      <form action={formAction} className="space-y-4">
        <input
          type="hidden"
          name="source_product_id"
          value={sourceProduct.id}
        />
        <input
          type="hidden"
          name="output_product_ids"
          value={JSON.stringify(outputProductIds)}
        />

        {state.message ? (
          <p
            className={cn(
              "rounded-xl px-3 py-2 text-sm",
              state.success
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700",
            )}
          >
            {state.message}
          </p>
        ) : null}

        <div className="space-y-2">
          <Label>Agregar producto resultante</Label>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <ProductCombobox
              options={candidateProducts.map((product) => ({
                id: product.id,
                name: product.name,
                category: product.categoryName,
                unit: unitsById.get(product.baseUnitId ?? "")?.symbol,
              }))}
              value={candidateId}
              onValueChange={setCandidateId}
              disabled={!canManage || !sourceDimensionId}
              placeholder="Buscar producto activo"
              ariaLabel="Producto resultante"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addCandidate}
              disabled={!candidateId || !canManage}
              className="rounded-xl"
            >
              <Plus className="size-4" />
              Agregar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Productos resultantes</p>
          {outputProductIds.length ? (
            outputProductIds.map((productId, index) => {
              const product = productsById.get(productId);
              const baseUnit = unitsById.get(product?.baseUnitId ?? "");
              return (
                <div
                  key={productId}
                  className="flex items-center gap-2 rounded-xl border bg-background p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {product?.name ?? "Producto no disponible"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Unidad base: {baseUnit?.symbol ?? "N/D"}
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-full">
                    Activo
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => move(index, -1)}
                    disabled={!canManage || index === 0}
                  >
                    <ArrowUp className="size-4" />
                    <span className="sr-only">Subir resultado</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => move(index, 1)}
                    disabled={
                      !canManage || index === outputProductIds.length - 1
                    }
                  >
                    <ArrowDown className="size-4" />
                    <span className="sr-only">Bajar resultado</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setOutputProductIds((current) =>
                        current.filter((id) => id !== productId),
                      )
                    }
                    disabled={!canManage}
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Retirar resultado</span>
                  </Button>
                </div>
              );
            })
          ) : (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Este producto requiere clasificación, pero todavía no tiene
              productos resultantes configurados.
            </p>
          )}
        </div>

        <Alert>
          <AlertTitle>Distribución variable, sin merma</AlertTitle>
          <AlertDescription>
            En cada ingreso deberás distribuir el 100 % entre los productos
            resultantes. El producto de entrada no acumula stock.
          </AlertDescription>
        </Alert>

        <Button
          type="submit"
          disabled={
            pending ||
            !canManage ||
            outputProductIds.length === 0 ||
            hasSourceWarning
          }
          className="rounded-xl"
        >
          <Save className="size-4" />
          {pending ? "Guardando..." : "Guardar productos resultantes"}
        </Button>
      </form>
    </section>
  );
}
