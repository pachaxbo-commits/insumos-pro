"use client";

import type { ReactNode } from "react";
import { useActionState, useState } from "react";
import { AlertTriangle, Edit3, ListChecks, PackageCheck, Plus, Save } from "lucide-react";

import {
  createQbProductAllowedUnitAction,
  updateQbProductAllowedUnitAction,
  upsertQbProductUnitSettingsAction,
} from "@/lib/products/actions";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/hooks/use-action-toast";
import type {
  ProductWithRelations,
  QbAllowedUnitContext,
  QbClassificationMode,
  QbProductAllowedUnit,
  QbProductClassificationOutput,
  QbProductPresentation,
  QbProductUnitSettings,
  QbUnit,
  QbUnitDimension,
} from "@/types/products";
import { QB_ALLOWED_UNIT_CONTEXTS } from "@/types/products";
import { QbProductPriceManagement } from "@/components/products/qb-product-price-management";
import { ProductCombobox } from "@/components/products/product-combobox";
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

type QbProductConfigPanelProps = {
  products: ProductWithRelations[];
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

function unitLabel(unit: QbUnit | undefined, dimensions: Map<string, QbUnitDimension>) {
  if (!unit) return "N/D";
  const dimension = dimensions.get(unit.dimension_id);
  return `${unit.name} (${unit.symbol})${dimension ? ` - ${dimension.name}` : ""}`;
}

function presentationLabel(presentation: QbProductPresentation | undefined) {
  if (!presentation) return "N/D";
  return `${presentation.name} (${presentation.symbol})`;
}

function contextLabel(context: QbAllowedUnitContext) {
  const labels: Record<QbAllowedUnitContext, string> = {
    pedido: "Pedido cliente",
    recepcion: "Recepcion",
    recibo: "Recibo",
    inventario: "Inventario",
  };

  return labels[context];
}

function classificationModeLabel(mode: QbClassificationMode) {
  const labels: Record<QbClassificationMode, string> = {
    none: "Sin clasificacion",
    manual: "Manual",
    percentage: "Por porcentaje",
    weight: "Por peso",
  };

  return labels[mode];
}

function ProductQbSettingsForm({
  productId,
  products,
  units,
  settings,
}: {
  productId?: string;
  products: ProductWithRelations[];
  units: QbUnit[];
  settings?: QbProductUnitSettings;
}) {
  const [state, formAction, pending] = useActionState(
    upsertQbProductUnitSettingsAction,
    initialState,
  );
  useActionToast(state);
  const defaultProductId = settings?.product_id ?? productId ?? "";
  const [selectedProductId, setSelectedProductId] = useState(defaultProductId);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Producto</Label>
          <ProductCombobox
            name="product_id"
            value={selectedProductId}
            onValueChange={setSelectedProductId}
            options={products.map((product) => ({
              id: product.id,
              name: product.name,
              category: product.category?.name,
              unit: product.unit?.abbreviation,
            }))}
            placeholder="Buscar por nombre, categoria o unidad"
          />
        </div>
        <div className="space-y-2">
          <Label>Unidad base inventario</Label>
          <NativeSelect
            name="base_inventory_unit_id"
            defaultValue={
              settings?.base_inventory_unit_id ??
              settings?.inventory_unit_id ??
              settings?.base_unit_id ??
              ""
            }
          >
            <option value="">Seleccionar</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Unidad base precio</Label>
          <NativeSelect
            name="base_price_unit_id"
            defaultValue={settings?.base_price_unit_id ?? settings?.base_unit_id ?? ""}
          >
            <option value="">Seleccionar</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Estado en el Catálogo</Label>
          <NativeSelect name="is_qb_active" defaultValue={String(settings?.is_qb_active ?? true)}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Visibilidad en el Catálogo</Label>
          <NativeSelect
            name="is_visible_in_qb_catalog"
            defaultValue={String(settings?.is_visible_in_qb_catalog ?? false)}
          >
            <option value="false">Oculto para clientes</option>
            <option value="true">Visible para clientes</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Clasificable</Label>
          <NativeSelect name="is_classifiable" defaultValue={String(settings?.is_classifiable ?? false)}>
            <option value="false">No clasificable</option>
            <option value="true">Puede clasificarse</option>
          </NativeSelect>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Modo de clasificacion</Label>
          <NativeSelect name="classification_mode" defaultValue={settings?.classification_mode ?? "none"}>
            <option value="none">Sin clasificacion</option>
            <option value="manual">Manual</option>
            <option value="percentage">Por porcentaje</option>
            <option value="weight">Por peso</option>
          </NativeSelect>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Notas internas</Label>
          <Textarea
            name="internal_notes"
            defaultValue={settings?.internal_notes ?? ""}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Notas de unidad</Label>
          <Textarea name="notes" defaultValue={settings?.notes ?? ""} className="rounded-xl" />
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

function ProductAllowedUnitForm({
  productId,
  products,
  units,
  presentations,
  allowedUnit,
}: {
  productId?: string;
  products: ProductWithRelations[];
  units: QbUnit[];
  presentations: QbProductPresentation[];
  allowedUnit?: QbProductAllowedUnit;
}) {
  const [state, formAction, pending] = useActionState(
    allowedUnit ? updateQbProductAllowedUnitAction : createQbProductAllowedUnitAction,
    initialState,
  );
  useActionToast(state);
  const defaultProductId = allowedUnit?.product_id ?? productId ?? "";
  const [selectedProductId, setSelectedProductId] = useState(defaultProductId);

  return (
    <form action={formAction} className="space-y-4">
      {allowedUnit ? <input type="hidden" name="id" value={allowedUnit.id} /> : null}
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Producto</Label>
          <ProductCombobox
            name="product_id"
            value={selectedProductId}
            onValueChange={setSelectedProductId}
            options={products.map((product) => ({
              id: product.id,
              name: product.name,
              category: product.category?.name,
              unit: product.unit?.abbreviation,
            }))}
            placeholder="Buscar producto"
          />
        </div>
        <div className="space-y-2">
          <Label>Contexto</Label>
          <NativeSelect name="usage_context" defaultValue={allowedUnit?.usage_context ?? "pedido"}>
            {QB_ALLOWED_UNIT_CONTEXTS.map((context) => (
              <option key={context} value={context}>
                {contextLabel(context)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Unidad universal</Label>
          <NativeSelect name="unit_id" defaultValue={allowedUnit?.unit_id ?? ""}>
            <option value="">Sin unidad universal</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Presentacion</Label>
          <NativeSelect name="presentation_id" defaultValue={allowedUnit?.presentation_id ?? ""}>
            <option value="">Sin presentacion</option>
            {presentations.map((presentation) => (
              <option key={presentation.id} value={presentation.id}>
                {presentation.name} ({presentation.symbol})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Predeterminada</Label>
          <NativeSelect name="is_default" defaultValue={String(allowedUnit?.is_default ?? false)}>
            <option value="false">No</option>
            <option value="true">Si</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Estado</Label>
          <NativeSelect name="is_active" defaultValue={String(allowedUnit?.is_active ?? true)}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Incremento</Label>
          <Input
            name="quantity_step"
            type="number"
            min="0.001"
            step="0.001"
            defaultValue={allowedUnit?.quantity_step ?? ""}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Cantidad minima</Label>
          <Input
            name="min_quantity"
            type="number"
            min="0.001"
            step="0.001"
            defaultValue={allowedUnit?.min_quantity ?? ""}
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
            defaultValue={allowedUnit?.sort_order ?? 0}
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Notas</Label>
          <Textarea name="notes" defaultValue={allowedUnit?.notes ?? ""} className="rounded-xl" />
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

export function QbProductConfigPanel({
  products,
  qbUnitDimensions,
  qbUnits,
  qbProductUnitSettings,
  qbProductPresentations,
  qbProductAllowedUnits,
  qbProductClassificationOutputs,
  qbParametrizationWarning,
  canManage,
  canManagePrice,
}: QbProductConfigPanelProps) {
  const dimensionsById = new Map(qbUnitDimensions.map((dimension) => [dimension.id, dimension]));
  const unitsById = new Map(qbUnits.map((unit) => [unit.id, unit]));
  const productsById = new Map(products.map((product) => [product.id, product]));
  const settingsByProductId = new Map(
    qbProductUnitSettings.map((settings) => [settings.product_id, settings]),
  );
  const presentationsById = new Map(
    qbProductPresentations.map((presentation) => [presentation.id, presentation]),
  );
  const configuredProducts = products.filter((product) => settingsByProductId.has(product.id)).length;
  const pendingProducts = Math.max(products.length - configuredProducts, 0);
  const activeProducts = products.filter((product) => product.is_active);
  const activeQbUnits = qbUnits.filter((unit) => unit.is_active);
  const canEditQb = canManage && !qbParametrizationWarning;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Productos</p>
          <h2 className="font-heading text-2xl font-semibold">Configuración por producto</h2>
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
          <AlertTitle>Configuración no disponible</AlertTitle>
          <AlertDescription>{qbParametrizationWarning}</AlertDescription>
        </Alert>
      ) : null}

      <QbProductPriceManagement
        products={products}
        settings={qbProductUnitSettings}
        units={qbUnits}
        allowedUnits={qbProductAllowedUnits}
        canManagePrice={canManagePrice && !qbParametrizationWarning}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Productos</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{products.length}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Configurados</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{configuredProducts}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Configuracion pendiente</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{pendingProducts}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Resultados activos</p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {qbProductClassificationOutputs.filter((output) => output.is_active).length}
          </p>
        </div>
      </div>

      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl">
            <PackageCheck className="size-5" />
            Productos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Producto</TableHead>
                  <TableHead>Inventario</TableHead>
                  <TableHead>Precio base</TableHead>
                  <TableHead>Visibilidad en el Catálogo</TableHead>
                  <TableHead>Clasificacion</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Config</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const settings = settingsByProductId.get(product.id);

                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {!settings ? (
                              <Badge
                                variant="outline"
                                className="rounded-full border-amber-200 bg-amber-50 text-amber-700"
                              >
                                Configuración pendiente
                              </Badge>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {product.sku || "Sin SKU"}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {settings
                          ? unitLabel(
                              unitsById.get(
                                settings.base_inventory_unit_id ??
                                  settings.inventory_unit_id ??
                                  settings.base_unit_id,
                              ),
                              dimensionsById,
                            )
                          : "Sin configurar"}
                      </TableCell>
                      <TableCell>
                        {settings?.base_sale_price !== null &&
                        settings?.base_sale_price !== undefined
                          ? `${formatNumber(settings.base_sale_price)} / ${
                              unitsById.get(settings.base_price_unit_id ?? settings.base_unit_id)
                                ?.symbol ?? "N/D"
                            }`
                          : "Sin precio base"}
                      </TableCell>
                      <TableCell>
                        {settings ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full",
                              settings.is_visible_in_qb_catalog
                                ? "border-teal-200 bg-teal-50 text-teal-700"
                                : "border-slate-200 bg-slate-50 text-slate-600",
                            )}
                          >
                            {settings.is_visible_in_qb_catalog ? "Visible para clientes" : "Oculto para clientes"}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">Pendiente</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {settings?.is_classifiable ? (
                          <Badge variant="outline" className="rounded-full">
                            {classificationModeLabel(settings.classification_mode)}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell>{settings ? <StatusBadge active={settings.is_qb_active} /> : "-"}</TableCell>
                      <TableCell className="text-right">
                        {canEditQb ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="rounded-xl">
                                <Edit3 className="size-4" />
                                Editar configuración
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                              <DialogHeader>
                                <DialogTitle>Configurar producto</DialogTitle>
                                <DialogDescription>
                                  Define unidades y reglas operativas del producto. El precio se administra en la sección de precios.
                                </DialogDescription>
                              </DialogHeader>
                              <ProductQbSettingsForm
                                productId={product.id}
                                products={activeProducts}
                                units={activeQbUnits}
                                settings={settings}
                              />
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <span className="text-xs text-muted-foreground">Lectura</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl">
            <ListChecks className="size-5" />
            Unidades permitidas por producto
          </CardTitle>
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
                  <DialogTitle>Nueva unidad permitida</DialogTitle>
                  <DialogDescription>Define una unidad o presentacion por contexto.</DialogDescription>
                </DialogHeader>
                <ProductAllowedUnitForm
                  products={activeProducts}
                  units={activeQbUnits}
                  presentations={qbProductPresentations.filter((presentation) => presentation.is_active)}
                />
              </DialogContent>
            </Dialog>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Producto</TableHead>
                  <TableHead>Contexto</TableHead>
                  <TableHead>Unidad o presentacion</TableHead>
                  <TableHead className="text-right">Min.</TableHead>
                  <TableHead className="text-right">Paso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qbProductAllowedUnits.map((allowedUnit) => (
                  <TableRow key={allowedUnit.id}>
                    <TableCell>{productsById.get(allowedUnit.product_id)?.name ?? "N/D"}</TableCell>
                    <TableCell>{contextLabel(allowedUnit.usage_context)}</TableCell>
                    <TableCell>
                      {allowedUnit.unit_id
                        ? unitLabel(unitsById.get(allowedUnit.unit_id), dimensionsById)
                        : presentationLabel(presentationsById.get(allowedUnit.presentation_id ?? ""))}
                    </TableCell>
                    <TableCell className="text-right">
                      {allowedUnit.min_quantity ? formatNumber(allowedUnit.min_quantity) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {allowedUnit.quantity_step ? formatNumber(allowedUnit.quantity_step) : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge active={allowedUnit.is_active} />
                        {allowedUnit.is_default ? <Badge variant="outline">Default</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {canEditQb ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <Edit3 className="size-4" />
                              <span className="sr-only">Editar unidad permitida</span>
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>Editar unidad permitida</DialogTitle>
                              <DialogDescription>
                                Actualiza la unidad o presentacion seleccionada.
                              </DialogDescription>
                            </DialogHeader>
                            <ProductAllowedUnitForm
                              products={activeProducts}
                              units={activeQbUnits}
                              presentations={qbProductPresentations.filter(
                                (presentation) => presentation.is_active,
                              )}
                              allowedUnit={allowedUnit}
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
          {!qbProductAllowedUnits.length ? (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
              No hay unidades permitidas registradas.
            </p>
          ) : null}
        </CardContent>
      </Card>

    </section>
  );
}
