"use client";

import { useActionState } from "react";
import { PackagePlus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionToast } from "@/hooks/use-action-toast";
import { createProductAction } from "@/lib/products/actions";
import { cn } from "@/lib/utils";
import type { ProductCategory, QbUnit } from "@/types/products";

type ActionState = { success: boolean; message?: string };

const initialState: ActionState = { success: false };
const selectClassName =
  "flex h-10 w-full rounded-xl border border-input bg-white/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

export function NewProductDialog({
  categories,
  qbUnits,
}: {
  categories: ProductCategory[];
  qbUnits: QbUnit[];
}) {
  const [state, formAction, pending] = useActionState(
    createProductAction,
    initialState,
  );
  useActionToast(state);
  const activeCategories = categories.filter((category) => category.is_active);
  const activeUnits = qbUnits.filter((unit) => unit.is_active);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="rounded-xl" data-performance-target="new-product">
          <PackagePlus className="size-4" />
          Nuevo producto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
          <DialogDescription>
            Registra un producto base sin movimientos de inventario.
          </DialogDescription>
        </DialogHeader>

        <form
          action={formAction}
          encType="multipart/form-data"
          className="space-y-4"
        >
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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="create-name">Nombre</Label>
              <Input
                id="create-name"
                name="name"
                placeholder="Tomate perita"
                required
                autoFocus
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-sku">SKU</Label>
              <Input
                id="create-sku"
                name="sku"
                placeholder="VER-TOM-001"
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-matrix-color">Color en la matriz</Label>
              <Input
                id="create-matrix-color"
                name="matrix_color"
                type="color"
                defaultValue="#FFFFFF"
                className="h-10 cursor-pointer rounded-xl p-1"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Control de peso real</Label>
              <select
                name="controls_actual_weight"
                defaultValue="false"
                className={selectClassName}
              >
                <option value="false">Solo controlar cantidad / unidad</option>
                <option value="true">Controlar también peso real en kg</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Actívalo para frutas, verduras u otros productos que deban
                pesarse. Déjalo desactivado para botellas, latas y unidades
                cerradas.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Categoría</Label>
              <select
                name="category_id"
                required
                defaultValue=""
                className={selectClassName}
              >
                <option value="" disabled>
                  Seleccionar
                </option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Unidad base</Label>
              <select
                name="base_unit_id"
                required
                defaultValue=""
                className={selectClassName}
              >
                <option value="" disabled>
                  Seleccionar
                </option>
                {activeUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.symbol})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Unidad de inventario</Label>
              <select
                name="inventory_unit_id"
                required
                defaultValue=""
                className={selectClassName}
              >
                <option value="" disabled>
                  Seleccionar
                </option>
                {activeUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.symbol})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Unidad de precio</Label>
              <select
                name="price_unit_id"
                required
                defaultValue=""
                className={selectClassName}
              >
                <option value="" disabled>
                  Seleccionar
                </option>
                {activeUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.symbol})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-stock-min">Stock mínimo</Label>
              <Input
                id="create-stock-min"
                name="stock_min"
                type="number"
                min="0"
                step="0.001"
                defaultValue="0"
                required
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label>Clasificación de ingreso</Label>
              <select
                name="requires_classification"
                defaultValue="false"
                className={selectClassName}
              >
                <option value="false">No requiere clasificación</option>
                <option value="true">
                  Requiere clasificación antes de ingresar
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Uso comercial</Label>
              <select
                name="is_sellable"
                defaultValue="true"
                className={selectClassName}
              >
                <option value="true">Producto vendible</option>
                <option value="false">Solo compra / uso interno</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Estado</Label>
              <select
                name="is_active"
                defaultValue="true"
                className={selectClassName}
              >
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
            </div>
          </div>

          <details className="rounded-2xl border bg-muted/20 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Información comercial opcional
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="create-supplier">Proveedor</Label>
                <Input
                  id="create-supplier"
                  name="supplier_name"
                  placeholder="Proveedor referencial"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="create-image">Fotografía del producto</Label>
                <Input
                  id="create-image"
                  name="image_file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  JPEG, PNG o WebP, hasta 5 MB.
                </p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="create-description">Descripción pública</Label>
                <Textarea
                  id="create-description"
                  name="catalog_description"
                  maxLength={1000}
                  className="min-h-24 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-sort-order">Orden público</Label>
                <Input
                  id="create-sort-order"
                  name="catalog_sort_order"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue="0"
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-min-quantity">Cantidad mínima</Label>
                <Input
                  id="create-min-quantity"
                  name="catalog_min_quantity"
                  type="number"
                  min="0.001"
                  step="0.001"
                  defaultValue="0.5"
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-quantity-step">
                  Incremento permitido
                </Label>
                <Input
                  id="create-quantity-step"
                  name="catalog_quantity_step"
                  type="number"
                  min="0.001"
                  step="0.001"
                  defaultValue="1"
                  required
                  className="rounded-xl"
                />
              </div>
            </div>
          </details>

          <DialogFooter>
            <Button type="submit" disabled={pending} className="rounded-xl">
              <Save className="size-4" />
              {pending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
