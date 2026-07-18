"use client";

import type { ReactNode } from "react";
import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Edit3, PackageOpen, Plus, Ruler, Save, Settings2 } from "lucide-react";

import {
  createQbProductPresentationAction,
  createQbUnitAction,
  createQbUnitDimensionAction,
  updateQbProductPresentationAction,
  updateQbUnitAction,
  updateQbUnitDimensionAction,
} from "@/lib/products/actions";
import { formatNumber } from "@/lib/format";
import { ProductCombobox } from "@/components/products/product-combobox";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/hooks/use-action-toast";
import type {
  ProductWithRelations,
  QbProductPresentation,
  QbUnit,
  QbUnitDimension,
} from "@/types/products";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type QbParametrizationPanelProps = {
  products: ProductWithRelations[];
  qbUnitDimensions: QbUnitDimension[];
  qbUnits: QbUnit[];
  qbProductPresentations: QbProductPresentation[];
  qbParametrizationWarning?: string;
  canManage: boolean;
};

const initialState: ActionState = { success: false };

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

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {active ? "Activo" : "Inactivo"}
    </Badge>
  );
}

function SectionTitle({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
      <CardTitle className="flex items-center gap-2 font-heading text-lg">
        {icon}
        {title}
      </CardTitle>
      {children}
    </CardHeader>
  );
}

function QbDimensionForm({ dimension }: { dimension?: QbUnitDimension }) {
  const [state, formAction, pending] = useActionState(
    dimension ? updateQbUnitDimensionAction : createQbUnitDimensionAction,
    initialState,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      {dimension ? <input type="hidden" name="id" value={dimension.id} /> : null}
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Codigo</Label>
          <Input name="code" defaultValue={dimension?.code ?? ""} required className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Nombre</Label>
          <Input name="name" defaultValue={dimension?.name ?? ""} required className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Unidad base</Label>
          <Input
            name="base_unit_code"
            defaultValue={dimension?.base_unit_code ?? ""}
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Orden</Label>
          <Input
            name="sort_order"
            type="number"
            min="0"
            step="1"
            defaultValue={dimension?.sort_order ?? 0}
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Estado</Label>
          <NativeSelect name="is_active" defaultValue={String(dimension?.is_active ?? true)}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </NativeSelect>
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

function QbUnitForm({
  unit,
  dimensions,
}: {
  unit?: QbUnit;
  dimensions: QbUnitDimension[];
}) {
  const [state, formAction, pending] = useActionState(
    unit ? updateQbUnitAction : createQbUnitAction,
    initialState,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      {unit ? <input type="hidden" name="id" value={unit.id} /> : null}
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Dimension</Label>
          <NativeSelect name="dimension_id" defaultValue={unit?.dimension_id ?? ""}>
            <option value="">Seleccionar</option>
            {dimensions.map((dimension) => (
              <option key={dimension.id} value={dimension.id}>
                {dimension.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Codigo</Label>
          <Input name="code" defaultValue={unit?.code ?? ""} required className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Nombre</Label>
          <Input name="name" defaultValue={unit?.name ?? ""} required className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Simbolo</Label>
          <Input name="symbol" defaultValue={unit?.symbol ?? ""} required className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Factor a base</Label>
          <Input
            name="conversion_factor_to_base"
            type="number"
            min="0.000001"
            step="0.000001"
            defaultValue={unit?.conversion_factor_to_base ?? 1}
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Base de dimension</Label>
          <NativeSelect name="is_base" defaultValue={String(unit?.is_base ?? false)}>
            <option value="false">No</option>
            <option value="true">Si</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Estado</Label>
          <NativeSelect name="is_active" defaultValue={String(unit?.is_active ?? true)}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </NativeSelect>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Orden</Label>
          <Input
            name="sort_order"
            type="number"
            min="0"
            step="1"
            defaultValue={unit?.sort_order ?? 0}
            required
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

function ProductPresentationForm({
  products,
  units,
  presentation,
}: {
  products: ProductWithRelations[];
  units: QbUnit[];
  presentation?: QbProductPresentation;
}) {
  const [state, formAction, pending] = useActionState(
    presentation ? updateQbProductPresentationAction : createQbProductPresentationAction,
    initialState,
  );
  const [productId, setProductId] = useState(presentation?.product_id ?? "");
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      {presentation ? <input type="hidden" name="id" value={presentation.id} /> : null}
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Producto</Label>
          <ProductCombobox
            name="product_id"
            value={productId}
            onValueChange={setProductId}
            options={products.map((product) => ({
              id: product.id,
              name: product.name,
              category: product.category?.name,
              unit: product.unit?.abbreviation,
            }))}
            placeholder="Buscar por nombre, categoria o unidad"
          />
          <Link href="/productos" className="inline-block text-xs font-medium text-primary hover:underline">
            Crear nuevo producto
          </Link>
        </div>
        <div className="space-y-2">
          <Label>Nombre</Label>
          <Input
            name="name"
            defaultValue={presentation?.name ?? ""}
            placeholder="Saco"
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Simbolo</Label>
          <Input
            name="symbol"
            defaultValue={presentation?.symbol ?? ""}
            placeholder="saco"
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Cantidad contenida</Label>
          <Input
            name="contained_quantity"
            type="number"
            min="0.001"
            step="0.001"
            defaultValue={presentation?.contained_quantity ?? 1}
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Unidad contenida</Label>
          <NativeSelect name="contained_unit_id" defaultValue={presentation?.contained_unit_id ?? ""}>
            <option value="">Seleccionar</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Equivalencia por unidad contenida</Label>
          <Input
            name="base_quantity"
            type="number"
            min="0.001"
            step="0.001"
            defaultValue={presentation?.base_quantity ?? 1}
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Unidad base</Label>
          <NativeSelect name="base_unit_id" defaultValue={presentation?.base_unit_id ?? ""}>
            <option value="">Seleccionar</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Total de una presentación en unidad base</Label>
          <Input
            name="conversion_factor_to_base"
            type="number"
            min="0.000001"
            step="0.000001"
            defaultValue={presentation?.conversion_factor_to_base ?? 1}
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Recepcion</Label>
          <NativeSelect name="allow_purchase" defaultValue={String(presentation?.allow_purchase ?? true)}>
            <option value="true">Permitida</option>
            <option value="false">No permitida</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Pedido</Label>
          <NativeSelect name="allow_order" defaultValue={String(presentation?.allow_order ?? false)}>
            <option value="false">No permitido</option>
            <option value="true">Permitido</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Recibo futuro</Label>
          <NativeSelect name="allow_sale" defaultValue={String(presentation?.allow_sale ?? false)}>
            <option value="false">No permitida</option>
            <option value="true">Permitida</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Inventario</Label>
          <NativeSelect
            name="allow_inventory"
            defaultValue={String(presentation?.allow_inventory ?? false)}
          >
            <option value="false">No permitido</option>
            <option value="true">Permitido</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Estado</Label>
          <NativeSelect name="is_active" defaultValue={String(presentation?.is_active ?? true)}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Orden</Label>
          <Input
            name="sort_order"
            type="number"
            min="0"
            step="1"
            defaultValue={presentation?.sort_order ?? 0}
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Notas</Label>
          <Textarea name="notes" defaultValue={presentation?.notes ?? ""} className="rounded-xl" />
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

export function QbParametrizationPanel({
  products,
  qbUnitDimensions,
  qbUnits,
  qbProductPresentations,
  qbParametrizationWarning,
  canManage,
}: QbParametrizationPanelProps) {
  const unitsById = new Map(qbUnits.map((unit) => [unit.id, unit]));
  const dimensionsById = new Map(qbUnitDimensions.map((dimension) => [dimension.id, dimension]));
  const productsById = new Map(products.map((product) => [product.id, product]));
  const activeProducts = products.filter((product) => product.is_active);
  const activeQbUnits = qbUnits.filter((unit) => unit.is_active);
  const canEditQb = canManage && !qbParametrizationWarning;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Parametrización</p>
          <h2 className="font-heading text-2xl font-semibold">
            Reglas de unidades, conversiones y presentaciones
          </h2>
        </div>
        {!canManage ? (
          <Badge variant="outline" className="w-fit rounded-full border-slate-200 bg-slate-50">
            Solo lectura
          </Badge>
        ) : null}
      </div>

      {qbParametrizationWarning ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle className="size-4" />
          <AlertTitle>Parametrización no disponible</AlertTitle>
          <AlertDescription>{qbParametrizationWarning}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Dimensiones</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{qbUnitDimensions.length}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Unidades universales</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{qbUnits.length}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Presentaciones</p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {qbProductPresentations.length}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-white/60 bg-card/92 shadow-sm">
          <SectionTitle title="Dimensiones" icon={<Settings2 className="size-5" />}>
            {canEditQb ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-xl">
                    <Plus className="size-4" />
                    Nueva
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Nueva dimensión</DialogTitle>
                    <DialogDescription>Registra una dimension de conversion.</DialogDescription>
                  </DialogHeader>
                  <QbDimensionForm />
                </DialogContent>
              </Dialog>
            ) : null}
          </SectionTitle>
          <CardContent className="space-y-3">
            {qbUnitDimensions.map((dimension) => (
              <div
                key={dimension.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{dimension.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {dimension.code} / base {dimension.base_unit_code}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge active={dimension.is_active} />
                  {canEditQb ? (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <Edit3 className="size-4" />
                          <span className="sr-only">Editar dimension</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Editar dimensión</DialogTitle>
                          <DialogDescription>Actualiza la dimension seleccionada.</DialogDescription>
                        </DialogHeader>
                        <QbDimensionForm dimension={dimension} />
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>
              </div>
            ))}
            {!qbUnitDimensions.length ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                No hay dimensiones registradas.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-card/92 shadow-sm">
          <SectionTitle title="Unidades universales" icon={<Ruler className="size-5" />}>
            {canEditQb ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-xl">
                    <Plus className="size-4" />
                    Nueva
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Nueva unidad</DialogTitle>
                    <DialogDescription>Registra una unidad global.</DialogDescription>
                  </DialogHeader>
                  <QbUnitForm dimensions={qbUnitDimensions} />
                </DialogContent>
              </Dialog>
            ) : null}
          </SectionTitle>
          <CardContent>
            <div className="overflow-hidden rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Unidad</TableHead>
                    <TableHead>Dimension</TableHead>
                    <TableHead className="text-right">Factor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Accion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qbUnits.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {unit.name} ({unit.symbol})
                          </p>
                          <p className="text-xs text-muted-foreground">{unit.code}</p>
                        </div>
                      </TableCell>
                      <TableCell>{dimensionsById.get(unit.dimension_id)?.name ?? "N/D"}</TableCell>
                      <TableCell className="text-right">
                        {formatNumber(unit.conversion_factor_to_base)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge active={unit.is_active} />
                          {unit.is_base ? (
                            <Badge
                              variant="outline"
                              className="rounded-full border-teal-200 bg-teal-50 text-teal-700"
                            >
                              Base
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {canEditQb ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <Edit3 className="size-4" />
                                <span className="sr-only">Editar unidad</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-xl">
                              <DialogHeader>
                                <DialogTitle>Editar unidad</DialogTitle>
                                <DialogDescription>Actualiza la unidad seleccionada.</DialogDescription>
                              </DialogHeader>
                              <QbUnitForm unit={unit} dimensions={qbUnitDimensions} />
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <span className="text-xs text-muted-foreground">Lectura</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/60 bg-card/92 shadow-sm">
        <SectionTitle title="Presentaciones y equivalencias" icon={<PackageOpen className="size-5" />}>
          {canEditQb ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-xl">
                  <Plus className="size-4" />
                  Nueva
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Nueva presentación</DialogTitle>
                  <DialogDescription>Registra una presentacion especifica del producto.</DialogDescription>
                </DialogHeader>
                <ProductPresentationForm products={activeProducts} units={activeQbUnits} />
              </DialogContent>
            </Dialog>
          ) : null}
        </SectionTitle>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Producto</TableHead>
                  <TableHead>Presentacion</TableHead>
                  <TableHead>Contenido</TableHead>
                  <TableHead>Equivalencia por unidad</TableHead>
                  <TableHead>Total presentación</TableHead>
                  <TableHead>Contextos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qbProductPresentations.map((presentation) => (
                  <TableRow key={presentation.id}>
                    <TableCell>{productsById.get(presentation.product_id)?.name ?? "N/D"}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{presentation.name}</p>
                        <p className="text-xs text-muted-foreground">{presentation.symbol}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatNumber(presentation.contained_quantity)}{" "}
                      {unitsById.get(presentation.contained_unit_id)?.symbol ?? "N/D"}
                    </TableCell>
                    <TableCell>
                      {formatNumber(presentation.base_quantity)}{" "}
                      {unitsById.get(presentation.base_unit_id)?.symbol ?? "N/D"}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {formatNumber(presentation.conversion_factor_to_base)}{" "}
                          {unitsById.get(presentation.base_unit_id)?.symbol ?? "N/D"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          1 {presentation.symbol.toLocaleLowerCase("es")} ={" "}
                          {formatNumber(presentation.contained_quantity)}{" "}
                          {unitsById.get(presentation.contained_unit_id)?.name.toLocaleLowerCase("es") ?? "unidades"}
                          {" = "}{formatNumber(presentation.conversion_factor_to_base)}{" "}
                          {unitsById.get(presentation.base_unit_id)?.symbol ?? "N/D"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {presentation.allow_purchase ? <Badge variant="outline">Recepcion</Badge> : null}
                        {presentation.allow_order ? <Badge variant="outline">Pedido</Badge> : null}
                        {presentation.allow_sale ? <Badge variant="outline">Recibo</Badge> : null}
                        {presentation.allow_inventory ? (
                          <Badge variant="outline">Inventario</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={presentation.is_active} />
                    </TableCell>
                    <TableCell className="text-right">
                      {canEditQb ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <Edit3 className="size-4" />
                              <span className="sr-only">Editar presentacion</span>
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>Editar presentación</DialogTitle>
                              <DialogDescription>
                                Actualiza la presentacion seleccionada.
                              </DialogDescription>
                            </DialogHeader>
                            <ProductPresentationForm
                              products={activeProducts}
                              units={activeQbUnits}
                              presentation={presentation}
                            />
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <span className="text-xs text-muted-foreground">Lectura</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!qbProductPresentations.length ? (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
              No hay presentaciones registradas.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
