"use client";

import type { ChangeEventHandler, ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Archive,
  Boxes,
  Edit3,
  Eye,
  Plus,
  Ruler,
  Save,
  Tags,
} from "lucide-react";

import {
  createCategoryAction,
  createProductAction,
  createUnitAction,
  deactivateProductAction,
  updateCategoryAction,
  updateProductAction,
  updateUnitAction,
} from "@/lib/products/actions";
import { ProductFiltersBar } from "@/components/products/product-filters-bar";
import { LazyProductClassificationConfiguration } from "@/components/products/lazy-product-classification-configuration";
import { ProductAmountModeControl } from "@/components/products/product-amount-mode-control";
import { ProductPricingEditor } from "@/components/products/product-pricing-editor";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/hooks/use-action-toast";
import type {
  ProductCategory,
  ProductFilters,
  ProductWithRelations,
  QbProductUnitSettings,
  QbUnit,
  UnitOfMeasure,
} from "@/types/products";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type ActionState = {
  success: boolean;
  message?: string;
};

type ProductManagementProps = {
  products: ProductWithRelations[];
  categories: ProductCategory[];
  units: UnitOfMeasure[];
  productIdsWithMovements: string[];
  filters: ProductFilters;
  qbUnits: QbUnit[];
  qbProductUnitSettings: QbProductUnitSettings[];
  qbParametrizationWarning?: string;
  canManage: boolean;
  canManagePrice: boolean;
  strictStockControl: boolean;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    activeProducts: number;
    lowStockProducts: number;
    publicProducts: number;
  };
};

const initialState: ActionState = { success: false };

function productPageHref(filters: ProductFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.category && filters.category !== "all") {
    params.set("category", filters.category);
  }
  if (filters.status && filters.status !== "all")
    params.set("status", filters.status);
  if (filters.stock && filters.stock !== "all")
    params.set("stock", filters.stock);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/productos?${query}` : "/productos";
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-100 text-slate-600",
      )}
    >
      {active ? "Activo" : "Inactivo"}
    </Badge>
  );
}

function StockBadge({
  product,
  strictStockControl,
}: {
  product: ProductWithRelations;
  strictStockControl: boolean;
}) {
  if (product.stock_status === "pendiente_regularizacion") {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-violet-200 bg-violet-50 text-violet-700"
      >
        {strictStockControl
          ? "Pendiente de regularización"
          : "Saldo provisional"}
      </Badge>
    );
  }

  if (product.stock_status === "sin_stock") {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-rose-200 bg-rose-50 text-rose-700"
      >
        Sin stock
      </Badge>
    );
  }

  if (product.stock_status === "stock_bajo") {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-amber-200 bg-amber-50 text-amber-700"
      >
        Stock bajo
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="rounded-full border-slate-200 bg-slate-50 text-slate-600"
    >
      Stock ok
    </Badge>
  );
}

function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;

  return (
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
  );
}

function NativeSelect({
  name,
  defaultValue,
  children,
  disabled,
  onChange,
  originalValue,
}: {
  name?: string;
  defaultValue?: string;
  children: ReactNode;
  disabled?: boolean;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  originalValue?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      onChange={onChange}
      data-original-value={originalValue}
      className="flex h-10 w-full rounded-xl border border-input bg-white/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </select>
  );
}

function ProductForm({
  product,
  categories,
  qbUnits,
  qbSettings,
  unitLocked = false,
  mode,
}: {
  product?: ProductWithRelations;
  categories: ProductCategory[];
  qbUnits: QbUnit[];
  qbSettings?: QbProductUnitSettings;
  unitLocked?: boolean;
  mode: "create" | "edit";
}) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createProductAction : updateProductAction,
    initialState,
  );
  useActionToast(state);
  const baseUnitId = qbSettings?.base_unit_id ?? "";
  const inventoryUnitId =
    qbSettings?.base_inventory_unit_id ??
    qbSettings?.inventory_unit_id ??
    baseUnitId;
  const priceUnitId = qbSettings?.base_price_unit_id ?? baseUnitId;
  const configuredUnitIds = new Set([baseUnitId, inventoryUnitId, priceUnitId]);
  const availableQbUnits = qbUnits.filter(
    (unit) => unit.is_active || configuredUnitIds.has(unit.id),
  );

  const confirmUnitChange: ChangeEventHandler<HTMLSelectElement> = (event) => {
    const originalValue = event.currentTarget.dataset.originalValue ?? "";
    if (
      mode === "edit" &&
      originalValue &&
      event.currentTarget.value !== originalValue &&
      !window.confirm(
        "¿Confirmas el cambio de unidad base para este producto sin movimientos?",
      )
    ) {
      event.currentTarget.value = originalValue;
    }
  };

  return (
    <form
      action={formAction}
      encType="multipart/form-data"
      className="space-y-4"
    >
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <FormMessage state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${mode}-name`}>Nombre</Label>
          <Input
            id={`${mode}-name`}
            name="name"
            defaultValue={product?.name}
            placeholder="Tomate perita"
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${mode}-sku`}>SKU</Label>
          <Input
            id={`${mode}-sku`}
            name="sku"
            defaultValue={product?.sku ?? ""}
            placeholder="VER-TOM-001"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${mode}-matrix-color`}>Color en la matriz</Label>
          <Input
            id={`${mode}-matrix-color`}
            name="matrix_color"
            type="color"
            defaultValue={product?.matrix_color ?? "#FFFFFF"}
            className="h-10 cursor-pointer rounded-xl p-1"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Control de peso real</Label>
          <NativeSelect
            name="controls_actual_weight"
            defaultValue={String(product?.controls_actual_weight ?? false)}
          >
            <option value="false">Solo controlar cantidad / unidad</option>
            <option value="true">Controlar también peso real en kg</option>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Se recomienda para frutas, verduras y otros productos variables. El
            recibo usará el peso solo si también existe un precio por kg, libra
            u otra unidad de peso; no lo actives para envases cerrados.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Estado</Label>
          <NativeSelect
            name="is_active"
            defaultValue={String(product?.is_active ?? true)}
          >
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </NativeSelect>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Clasificacion de ingreso</Label>
          <NativeSelect
            name="requires_classification"
            defaultValue={String(product?.requires_classification ?? false)}
          >
            <option value="false">No requiere clasificacion</option>
            <option value="true">
              Requiere clasificacion antes de ingresar a inventario
            </option>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Los productos que requieren clasificacion son solo de compra y no
            pueden publicarse.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Categoria</Label>
          <NativeSelect
            name="category_id"
            defaultValue={product?.category_id ?? ""}
          >
            <option value="">Seleccionar</option>
            {categories
              .filter(
                (category) =>
                  category.is_active || category.id === product?.category_id,
              )
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </NativeSelect>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Unidad base</Label>
          {unitLocked ? (
            <input type="hidden" name="base_unit_id" value={baseUnitId} />
          ) : null}
          <NativeSelect
            name={unitLocked ? undefined : "base_unit_id"}
            defaultValue={baseUnitId}
            disabled={unitLocked}
            onChange={confirmUnitChange}
            originalValue={baseUnitId}
          >
            <option value="">Seleccionar</option>
            {availableQbUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </NativeSelect>
          {unitLocked ? (
            <p className="text-xs font-medium text-amber-700">
              No puedes cambiar la unidad base porque este producto ya tiene
              movimientos de inventario.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              La unidad es obligatoria. Las unidades de inventario, precio y
              pedido se administran en la configuración operativa.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Unidad de inventario</Label>
          {unitLocked ? (
            <input
              type="hidden"
              name="inventory_unit_id"
              value={inventoryUnitId}
            />
          ) : null}
          <NativeSelect
            name={unitLocked ? undefined : "inventory_unit_id"}
            defaultValue={inventoryUnitId}
            disabled={unitLocked}
            onChange={confirmUnitChange}
            originalValue={inventoryUnitId}
          >
            <option value="">Seleccionar</option>
            {availableQbUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </NativeSelect>
        </div>

        {mode === "create" ? (
          <div className="space-y-2">
            <Label>Unidad de precio inicial</Label>
            <NativeSelect name="price_unit_id" defaultValue={priceUnitId}>
              <option value="">Seleccionar</option>
              {availableQbUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.symbol})
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Después de crear el producto podrás registrar el monto exacto.
            </p>
          </div>
        ) : (
          <input type="hidden" name="price_unit_id" value={priceUnitId} />
        )}

        <div className="space-y-2">
          <Label htmlFor={`${mode}-stock-min`}>Stock minimo</Label>
          <Input
            id={`${mode}-stock-min`}
            name="stock_min"
            type="number"
            min="0"
            step="0.001"
            defaultValue={product?.stock_min ?? 0}
            required
            className="rounded-xl"
          />
        </div>

        {mode === "create" ? (
          <div className="space-y-2 md:col-span-2">
            <Label>Permitir pedidos por importe en Bs</Label>
            <label className="flex items-start gap-3 rounded-xl border bg-muted/25 p-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                disabled
                checked={false}
                className="mt-0.5"
              />
              <span>
                Guarda el producto, configura sus unidades y registra un precio
                base positivo. Después podrás habilitar esta modalidad desde
                Editar producto o Configuración por producto.
              </span>
            </label>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={`${mode}-supplier`}>Proveedor</Label>
          <Input
            id={`${mode}-supplier`}
            name="supplier_name"
            defaultValue={product?.supplier_name ?? ""}
            placeholder="Proveedor referencial"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${mode}-image`}>Fotografia del producto</Label>
          <Input
            id={`${mode}-image`}
            name="image_file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            JPEG, PNG o WebP, hasta 5 MB. Al subir una nueva fotografia se
            reemplaza la anterior.
          </p>
          {product?.image_url ? (
            <div
              role="img"
              aria-label={`Fotografia actual de ${product.name}`}
              className="h-24 w-24 rounded-xl border bg-cover bg-center"
              style={{
                backgroundImage: `url(${JSON.stringify(product.image_url)})`,
              }}
            />
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>Uso comercial</Label>
          <NativeSelect
            name="is_sellable"
            defaultValue={String(product?.is_sellable ?? true)}
          >
            <option value="true">Producto vendible</option>
            <option value="false">Solo compra / uso interno</option>
          </NativeSelect>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${mode}-catalog-description`}>
            Descripcion publica
          </Label>
          <Textarea
            id={`${mode}-catalog-description`}
            name="catalog_description"
            defaultValue={product?.catalog_description ?? ""}
            maxLength={1000}
            placeholder="Descripcion breve para el cliente, sin datos internos."
            className="min-h-24 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${mode}-catalog-sort-order`}>Orden publico</Label>
          <Input
            id={`${mode}-catalog-sort-order`}
            name="catalog_sort_order"
            type="number"
            min="0"
            step="1"
            defaultValue={product?.catalog_sort_order ?? 0}
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${mode}-catalog-min-quantity`}>
            Cantidad minima
          </Label>
          <Input
            id={`${mode}-catalog-min-quantity`}
            name="catalog_min_quantity"
            type="number"
            min="0.001"
            step="0.001"
            defaultValue={product?.catalog_min_quantity ?? 1}
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${mode}-catalog-quantity-step`}>
            Incremento permitido
          </Label>
          <Input
            id={`${mode}-catalog-quantity-step`}
            name="catalog_quantity_step"
            type="number"
            min="0.001"
            step="0.001"
            defaultValue={product?.catalog_quantity_step ?? 1}
            required
            className="rounded-xl"
          />
        </div>

        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground md:col-span-2">
          El stock se modifica mediante Ingresos y Entregas. El precio base, la
          unidad de precio, las presentaciones y la visibilidad se configuran
          despues de guardar el producto. El catalogo nunca muestra costo, stock
          exacto, proveedor ni margen.
        </p>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending} className="rounded-xl">
          <Save className="size-4" />
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CatalogForm({
  type,
  item,
}: {
  type: "category" | "unit";
  item?: ProductCategory | UnitOfMeasure;
}) {
  const isCategory = type === "category";
  const createAction = isCategory ? createCategoryAction : createUnitAction;
  const updateAction = isCategory ? updateCategoryAction : updateUnitAction;
  const [state, formAction, pending] = useActionState(
    item ? updateAction : createAction,
    initialState,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label>Nombre</Label>
        <Input
          name="name"
          defaultValue={item?.name}
          required
          className="rounded-xl"
        />
      </div>
      {isCategory ? (
        <>
          <div className="space-y-2">
            <Label>Descripcion</Label>
            <Textarea
              name="description"
              defaultValue={
                (item as ProductCategory | undefined)?.description ?? ""
              }
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Slug publico</Label>
            <Input
              name="catalog_slug"
              defaultValue={
                (item as ProductCategory | undefined)?.catalog_slug ?? ""
              }
              placeholder="verduras-frescas"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Si queda vacio, se genera automaticamente desde el nombre.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Orden publico</Label>
            <Input
              name="catalog_sort_order"
              type="number"
              min="0"
              step="1"
              defaultValue={
                (item as ProductCategory | undefined)?.catalog_sort_order ?? 0
              }
              required
              className="rounded-xl"
            />
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label>Abreviatura</Label>
          <Input
            name="abbreviation"
            defaultValue={
              (item as UnitOfMeasure | undefined)?.abbreviation ?? ""
            }
            required
            className="rounded-xl"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label>Estado</Label>
        <NativeSelect
          name="is_active"
          defaultValue={String(item?.is_active ?? true)}
        >
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </NativeSelect>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending} className="rounded-xl">
          <Save className="size-4" />
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CatalogList({
  title,
  icon,
  items,
  type,
  canManage,
}: {
  title: string;
  icon: ReactNode;
  items: Array<ProductCategory | UnitOfMeasure>;
  type: "category" | "unit";
  canManage: boolean;
}) {
  return (
    <Card className="border-white/60 bg-card/92 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 font-heading text-lg">
          {icon}
          {title}
        </CardTitle>
        {canManage ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl">
                <Plus className="size-4" />
                Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {type === "category" ? "Nueva categoria" : "Nueva unidad"}
                </DialogTitle>
                <DialogDescription>
                  Completa los datos para agregar el registro.
                </DialogDescription>
              </DialogHeader>
              <CatalogForm type={type} />
            </DialogContent>
          </Dialog>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {"abbreviation" in item
                  ? item.abbreviation
                  : item.description || "Sin descripcion"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge active={item.is_active} />
              {canManage ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <Edit3 className="size-4" />
                      <span className="sr-only">Editar</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>
                        Editar {type === "category" ? "categoria" : "unidad"}
                      </DialogTitle>
                      <DialogDescription>
                        Actualiza el registro seleccionado.
                      </DialogDescription>
                    </DialogHeader>
                    <CatalogForm type={type} item={item} />
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ProductDeactivateForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState(
    deactivateProductAction,
    initialState,
  );
  useActionToast(state);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={productId} />
      <Button variant="outline" size="icon-sm" type="submit" disabled={pending}>
        <Archive className="size-4" />
        <span className="sr-only">Desactivar producto</span>
      </Button>
    </form>
  );
}

export function ProductManagement({
  products,
  categories,
  units,
  productIdsWithMovements,
  filters,
  qbUnits,
  qbProductUnitSettings,
  qbParametrizationWarning,
  canManage,
  canManagePrice,
  strictStockControl,
  pagination,
  summary,
}: ProductManagementProps) {
  const activeProducts = summary.activeProducts;
  const lowStock = summary.lowStockProducts;
  const qbVisibleProductIds = new Set(
    qbProductUnitSettings
      .filter(
        (settings) =>
          settings.is_qb_active && settings.is_visible_in_qb_catalog,
      )
      .map((settings) => settings.product_id),
  );
  const publicProducts = summary.publicProducts;
  const qbConfiguredProductIds = new Set(
    qbProductUnitSettings.map((settings) => settings.product_id),
  );
  const productsWithMovements = new Set(productIdsWithMovements);
  const qbUnitsById = new Map(qbUnits.map((unit) => [unit.id, unit]));
  const qbSettingsByProduct = new Map(
    qbProductUnitSettings.map((settings) => [settings.product_id, settings]),
  );
  const effectiveUnit = (product: ProductWithRelations) => {
    const settings = qbSettingsByProduct.get(product.id);
    const unitId =
      settings?.base_inventory_unit_id ??
      settings?.inventory_unit_id ??
      settings?.base_unit_id;
    return (
      (unitId ? qbUnitsById.get(unitId)?.symbol : null) ??
      product.unit?.abbreviation ??
      "Sin configurar"
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Productos activos</p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {activeProducts}
          </p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Alertas de inventario</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{lowStock}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Visibles en catalogo</p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {publicProducts}
          </p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Categorias y unidades</p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {categories.length + units.length}
          </p>
        </div>
      </div>

      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="font-heading text-xl">
                Catálogo de productos
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Consulta y administra productos, categorías, estados y precios
                base.
              </p>
            </div>
            {!canManage ? (
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-200 bg-slate-50 text-slate-600"
                >
                  Solo lectura
                </Badge>
              </div>
            ) : null}
          </div>

          <ProductFiltersBar categories={categories} filters={filters} />
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Minimo</TableHead>
                  <TableHead className="text-right">Compra</TableHead>
                  <TableHead className="text-right">Venta</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative size-11 shrink-0 overflow-hidden rounded-xl border bg-slate-100">
                          {product.image_url ? (
                            <Image
                              src={product.image_url}
                              alt={`Fotografía de ${product.name}`}
                              fill
                              sizes="44px"
                              className="object-cover"
                            />
                          ) : null}
                        </div>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {product.sku || "Sin SKU"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {product.category?.name ?? "Sin categoria"}
                    </TableCell>
                    <TableCell>{effectiveUnit(product)}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(product.stock_current)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(product.stock_min)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(product.purchase_price)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(product.sale_price)}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.margin_percentage.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge active={product.is_active} />
                        <StockBadge
                          product={product}
                          strictStockControl={strictStockControl}
                        />
                        {qbVisibleProductIds.has(product.id) ? (
                          <Badge
                            variant="outline"
                            className="rounded-full border-teal-200 bg-teal-50 text-teal-700"
                          >
                            <Eye className="size-3" />
                            Catálogo
                          </Badge>
                        ) : null}
                        {product.is_sellable === false ? (
                          <Badge
                            variant="outline"
                            className="rounded-full border-slate-200 bg-slate-100 text-slate-600"
                          >
                            Solo compra
                          </Badge>
                        ) : null}
                        {qbParametrizationWarning ? null : qbConfiguredProductIds.has(
                            product.id,
                          ) ? (
                          <Badge
                            variant="outline"
                            className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            Configurado
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="rounded-full border-amber-200 bg-amber-50 text-amber-700"
                          >
                            Configuración pendiente
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {canManage ? (
                          <>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="icon-sm">
                                  <Edit3 className="size-4" />
                                  <span className="sr-only">
                                    Editar producto
                                  </span>
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
                                <DialogHeader>
                                  <DialogTitle>Editar producto</DialogTitle>
                                  <DialogDescription>
                                    Actualiza los datos base del producto.
                                  </DialogDescription>
                                </DialogHeader>
                                <ProductForm
                                  mode="edit"
                                  product={product}
                                  categories={categories}
                                  qbUnits={qbUnits}
                                  qbSettings={qbSettingsByProduct.get(
                                    product.id,
                                  )}
                                  unitLocked={productsWithMovements.has(
                                    product.id,
                                  )}
                                />
                                <ProductPricingEditor
                                  product={product}
                                  settings={qbSettingsByProduct.get(product.id)}
                                  units={qbUnits}
                                  canManage={canManagePrice}
                                />
                                <ProductAmountModeControl
                                  productId={product.id}
                                  enabled={Boolean(
                                    qbSettingsByProduct.get(product.id)
                                      ?.supports_amount_bs,
                                  )}
                                  canManage={canManagePrice}
                                />
                                {product.requires_classification ? (
                                  <LazyProductClassificationConfiguration
                                    sourceProduct={product}
                                    canManage={canManage}
                                  />
                                ) : null}
                              </DialogContent>
                            </Dialog>
                            {product.is_active ? (
                              <ProductDeactivateForm productId={product.id} />
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Lectura
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!products.length ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Boxes className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  No hay productos para estos filtros
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ajusta la busqueda o registra el primer producto.
                </p>
              </div>
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/productos">Limpiar filtros</Link>
              </Button>
            </div>
          ) : null}

          {pagination.totalPages > 1 ? (
            <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {(pagination.page - 1) * pagination.pageSize + 1}–
                {Math.min(
                  pagination.page * pagination.pageSize,
                  pagination.total,
                )}{" "}
                de {pagination.total}
              </p>
              <div className="flex items-center gap-2">
                {pagination.page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={productPageHref(filters, pagination.page - 1)}
                      scroll={false}
                    >
                      Anterior
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Anterior
                  </Button>
                )}
                <span className="px-2 text-sm text-muted-foreground">
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                {pagination.page < pagination.totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={productPageHref(filters, pagination.page + 1)}
                      scroll={false}
                    >
                      Siguiente
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Siguiente
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <CatalogList
          title="Categorias"
          icon={<Tags className="size-5" />}
          items={categories}
          type="category"
          canManage={canManage}
        />
        <CatalogList
          title="Unidades de medida"
          icon={<Ruler className="size-5" />}
          items={units}
          type="unit"
          canManage={canManage}
        />
      </div>
    </div>
  );
}
