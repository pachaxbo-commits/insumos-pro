"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import {
  Archive,
  Boxes,
  Edit3,
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
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  ProductCategory,
  ProductFilters,
  ProductWithRelations,
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
  canManage: boolean;
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
            min="0"
            step="0.01"
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
            step="0.01"
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

  return (
    <form action={formAction} className="space-y-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label>Nombre</Label>
        <Input name="name" defaultValue={item?.name} required className="rounded-xl" />
      </div>
      {isCategory ? (
        <div className="space-y-2">
          <Label>Descripcion</Label>
          <Textarea
            name="description"
            defaultValue={(item as ProductCategory | undefined)?.description ?? ""}
            className="rounded-xl"
          />
        </div>
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

export function ProductManagement({
  products,
  categories,
  units,
  filters,
  canManage,
}: ProductManagementProps) {
  const activeProducts = products.filter((product) => product.is_active).length;
  const lowStock = products.filter((product) => product.stock_status !== "ok").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Productos activos</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{activeProducts}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Stock bajo o agotado</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{lowStock}</p>
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
              <CardTitle className="font-heading text-xl">Catalogo de productos</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Productos conectados a Supabase con filtros, estados y precios base.
              </p>
            </div>
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
              <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                Solo lectura
              </Badge>
            )}
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
                              <form action={deactivateProductAction}>
                                <input type="hidden" name="id" value={product.id} />
                                <Button variant="outline" size="icon-sm" type="submit">
                                  <Archive className="size-4" />
                                  <span className="sr-only">Desactivar producto</span>
                                </Button>
                              </form>
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
