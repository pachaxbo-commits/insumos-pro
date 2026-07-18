"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import {
  Archive,
  Boxes,
  Edit3,
  Eye,
  PackagePlus,
  Plus,
  Ruler,
  Save,
  Search,
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
import { QbProductConfigPanel } from "@/components/products/qb-product-config-panel";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/hooks/use-action-toast";
import type {
  ProductCategory,
  ProductFilters,
  ProductWithRelations,
  QbProductAllowedUnit,
  QbProductClassificationOutput,
  QbProductPresentation,
  QbProductUnitSettings,
  QbUnit,
  QbUnitDimension,
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
  filters: ProductFilters;
  qbUnitDimensions: QbUnitDimension[];
  qbUnits: QbUnit[];
  qbProductUnitSettings: QbProductUnitSettings[];
  qbProductPresentations: QbProductPresentation[];
  qbProductAllowedUnits: QbProductAllowedUnit[];
  qbProductClassificationOutputs: QbProductClassificationOutput[];
  qbParametrizationWarning?: string;
  canManage: boolean;
  canManagePrice: boolean;
};

const initialState: ActionState = { success: false };

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

function StockBadge({ product }: { product: ProductWithRelations }) {
  if (product.stock_status === "pendiente_regularizacion") {
    return (
      <Badge variant="outline" className="rounded-full border-violet-200 bg-violet-50 text-violet-700">
        Pendiente de regularización
      </Badge>
    );
  }

  if (product.stock_status === "sin_stock") {
    return (
      <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 text-rose-700">
        Sin stock
      </Badge>
    );
  }

  if (product.stock_status === "stock_bajo") {
    return (
      <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
        Stock bajo
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
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
        state.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
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
}: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      className="flex h-10 w-full rounded-xl border border-input bg-white/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </select>
  );
}

function ProductForm({
  product,
  categories,
  units,
  mode,
}: {
  product?: ProductWithRelations;
  categories: ProductCategory[];
  units: UnitOfMeasure[];
  mode: "create" | "edit";
}) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createProductAction : updateProductAction,
    initialState,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
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
          <Label>Estado</Label>
          <NativeSelect name="is_active" defaultValue={String(product?.is_active ?? true)}>
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
            <option value="true">Requiere clasificacion antes de ingresar a inventario</option>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Los productos que requieren clasificacion son solo de compra y no pueden publicarse.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Categoria</Label>
          <NativeSelect name="category_id" defaultValue={product?.category_id ?? ""}>
            <option value="">Seleccionar</option>
            {categories
              .filter((category) => category.is_active || category.id === product?.category_id)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label>Unidad</Label>
          <NativeSelect name="unit_id" defaultValue={product?.unit_id ?? ""}>
            <option value="">Seleccionar</option>
            {units
              .filter((unit) => unit.is_active || unit.id === product?.unit_id)
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.abbreviation})
                </option>
              ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${mode}-stock-current`}>Stock actual</Label>
          <Input
            id={`${mode}-stock-current`}
            name="stock_current"
            type="number"
            step="0.001"
            defaultValue={product?.stock_current ?? 0}
            required
            className="rounded-xl"
          />
        </div>

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

        <div className="space-y-2">
          <Label htmlFor={`${mode}-purchase-price`}>Precio compra</Label>
          <Input
            id={`${mode}-purchase-price`}
            name="purchase_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={product?.purchase_price ?? 0}
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${mode}-sale-price`}>Precio venta</Label>
          <Input
            id={`${mode}-sale-price`}
            name="sale_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={product?.sale_price ?? 0}
            required
            className="rounded-xl"
          />
        </div>

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

        <div className="space-y-2">
          <Label htmlFor={`${mode}-image`}>Imagen URL</Label>
          <Input
            id={`${mode}-image`}
            name="image_url"
            defaultValue={product?.image_url ?? ""}
            placeholder="https://..."
            className="rounded-xl"
          />
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
          <Label htmlFor={`${mode}-catalog-description`}>Descripcion publica</Label>
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
          <Label htmlFor={`${mode}-catalog-min-quantity`}>Cantidad minima</Label>
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
          <Label htmlFor={`${mode}-catalog-quantity-step`}>Incremento permitido</Label>
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
          Para publicar, la categoria tambien debe ser visible. El catalogo nunca muestra costo,
          stock exacto, proveedor ni margen.
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
  const [state, formAction, pending] = useActionState(item ? updateAction : createAction, initialState);
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label>Nombre</Label>
        <Input name="name" defaultValue={item?.name} required className="rounded-xl" />
      </div>
      {isCategory ? (
        <>
          <div className="space-y-2">
            <Label>Descripcion</Label>
            <Textarea
              name="description"
              defaultValue={(item as ProductCategory | undefined)?.description ?? ""}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Slug publico</Label>
            <Input
              name="catalog_slug"
              defaultValue={(item as ProductCategory | undefined)?.catalog_slug ?? ""}
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
              defaultValue={(item as ProductCategory | undefined)?.catalog_sort_order ?? 0}
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
            defaultValue={(item as UnitOfMeasure | undefined)?.abbreviation ?? ""}
            required
            className="rounded-xl"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label>Estado</Label>
        <NativeSelect name="is_active" defaultValue={String(item?.is_active ?? true)}>
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
                <DialogTitle>{type === "category" ? "Nueva categoria" : "Nueva unidad"}</DialogTitle>
                <DialogDescription>Completa los datos para agregar el registro.</DialogDescription>
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
                {"abbreviation" in item ? item.abbreviation : item.description || "Sin descripcion"}
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
                      <DialogTitle>Editar {type === "category" ? "categoria" : "unidad"}</DialogTitle>
                      <DialogDescription>Actualiza el registro seleccionado.</DialogDescription>
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
  const [state, formAction, pending] = useActionState(deactivateProductAction, initialState);
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
  filters,
  qbUnitDimensions,
  qbUnits,
  qbProductUnitSettings,
  qbProductPresentations,
  qbProductAllowedUnits,
  qbProductClassificationOutputs,
  qbParametrizationWarning,
  canManage,
  canManagePrice,
}: ProductManagementProps) {
  const activeProducts = products.filter((product) => product.is_active).length;
  const lowStock = products.filter((product) => product.stock_status !== "ok").length;
  const qbVisibleProductIds = new Set(
    qbProductUnitSettings
      .filter((settings) => settings.is_qb_active && settings.is_visible_in_qb_catalog)
      .map((settings) => settings.product_id),
  );
  const publicProducts = products.filter(
    (product) => product.is_active && qbVisibleProductIds.has(product.id),
  ).length;
  const qbConfiguredProductIds = new Set(
    qbProductUnitSettings.map((settings) => settings.product_id),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Productos activos</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{activeProducts}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Alertas de inventario</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{lowStock}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Visibles en catalogo</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{publicProducts}</p>
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
              <CardTitle className="font-heading text-xl">Catálogo de productos</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Consulta y administra productos, categorías, estados y precios base.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="rounded-xl">
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
                    <ProductForm mode="create" categories={categories} units={units} />
                  </DialogContent>
                </Dialog>
              ) : (
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-200 bg-slate-50 text-slate-600"
                >
                  Solo lectura
                </Badge>
              )}
            </div>
          </div>

          <form className="grid gap-3 lg:grid-cols-[1.3fr_0.8fr_0.7fr_0.7fr_auto]" action="/productos">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={filters.q ?? ""}
                placeholder="Buscar por nombre o SKU"
                className="h-10 rounded-xl pl-10"
              />
            </div>
            <NativeSelect name="category" defaultValue={filters.category ?? "all"}>
              <option value="all">Todas las categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="status" defaultValue={filters.status ?? "all"}>
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </NativeSelect>
            <NativeSelect name="stock" defaultValue={filters.stock ?? "all"}>
              <option value="all">Todo stock</option>
              <option value="low">Stock bajo</option>
            </NativeSelect>
            <Button type="submit" variant="outline" className="rounded-xl">
              Filtrar
            </Button>
          </form>
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
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.sku || "Sin SKU"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{product.category?.name ?? "Sin categoria"}</TableCell>
                    <TableCell>{product.unit?.abbreviation ?? "N/D"}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(product.stock_current)}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(product.stock_min)}</TableCell>
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
                        <StockBadge product={product} />
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
                                  <span className="sr-only">Editar producto</span>
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
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
                                  units={units}
                                />
                              </DialogContent>
                            </Dialog>
                            {product.is_active ? (
                              <ProductDeactivateForm productId={product.id} />
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Lectura</span>
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
                <p className="font-medium">No hay productos para estos filtros</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ajusta la busqueda o registra el primer producto.
                </p>
              </div>
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/productos">Limpiar filtros</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <QbProductConfigPanel
        products={products}
        qbUnitDimensions={qbUnitDimensions}
        qbUnits={qbUnits}
        qbProductUnitSettings={qbProductUnitSettings}
        qbProductPresentations={qbProductPresentations}
        qbProductAllowedUnits={qbProductAllowedUnits}
        qbProductClassificationOutputs={qbProductClassificationOutputs}
        qbParametrizationWarning={qbParametrizationWarning}
        canManage={canManage}
        canManagePrice={canManagePrice}
      />

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
