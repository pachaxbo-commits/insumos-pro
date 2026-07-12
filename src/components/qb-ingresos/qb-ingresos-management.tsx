"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useActionState, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  PackageOpen,
  Save,
  Scale,
  Split,
  XCircle,
} from "lucide-react";

import {
  annulQbMerchandiseReceiptAction,
  confirmQbMerchandiseReceiptAction,
  createQbMerchandiseReceiptAction,
  saveQbMerchandiseClassificationAction,
} from "@/lib/qb-ingresos/actions";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/hooks/use-action-toast";
import type {
  ProductWithRelations,
  QbProductAllowedUnit,
  QbProductClassificationOutput,
  QbProductPresentation,
  QbProductUnitSettings,
  QbUnit,
} from "@/types/products";
import type {
  QbIngresosData,
  QbMerchandiseReceiptLineWithRelations,
  QbMerchandiseReceiptStatus,
  QbMerchandiseReceiptWithRelations,
} from "@/types/qb-ingresos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ActionState = {
  success: boolean;
  message?: string;
};

type QbIngresosManagementProps = QbIngresosData & {
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
  value,
  onChange,
  children,
  disabled,
}: {
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="flex h-10 w-full rounded-xl border border-input bg-white/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </select>
  );
}

function StatusBadge({ status }: { status: QbMerchandiseReceiptStatus }) {
  const styles: Record<QbMerchandiseReceiptStatus, string> = {
    borrador: "border-amber-200 bg-amber-50 text-amber-700",
    confirmado: "border-emerald-200 bg-emerald-50 text-emerald-700",
    anulado: "border-slate-200 bg-slate-100 text-slate-600",
  };

  return (
    <Badge variant="outline" className={cn("rounded-full", styles[status])}>
      {status}
    </Badge>
  );
}

function unitLabel(unit: QbUnit | undefined) {
  if (!unit) return "N/D";
  return `${unit.name} (${unit.symbol})`;
}

function presentationLabel(presentation: QbProductPresentation | undefined) {
  if (!presentation) return "N/D";
  return `${presentation.name} (${presentation.symbol})`;
}

function allowedUnitLabel(
  allowedUnit: QbProductAllowedUnit,
  unitsById: Map<string, QbUnit>,
  presentationsById: Map<string, QbProductPresentation>,
) {
  if (allowedUnit.unit_id) return unitLabel(unitsById.get(allowedUnit.unit_id));
  if (allowedUnit.presentation_id) {
    return presentationLabel(presentationsById.get(allowedUnit.presentation_id));
  }

  return "N/D";
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function CreateReceiptForm({
  products,
  qbProductUnitSettings,
  qbProductAllowedUnits,
  qbProductPresentations,
  qbUnits,
  canManage,
}: {
  products: ProductWithRelations[];
  qbProductUnitSettings: QbProductUnitSettings[];
  qbProductAllowedUnits: QbProductAllowedUnit[];
  qbProductPresentations: QbProductPresentation[];
  qbUnits: QbUnit[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createQbMerchandiseReceiptAction,
    initialState,
  );
  useActionToast(state);

  const settingsByProductId = useMemo(
    () => new Map(qbProductUnitSettings.map((settings) => [settings.product_id, settings])),
    [qbProductUnitSettings],
  );
  const unitsById = useMemo(() => new Map(qbUnits.map((unit) => [unit.id, unit])), [qbUnits]);
  const presentationsById = useMemo(
    () => new Map(qbProductPresentations.map((presentation) => [presentation.id, presentation])),
    [qbProductPresentations],
  );
  const activeQbProducts = products.filter((product) => {
    const settings = settingsByProductId.get(product.id);
    return product.is_active && settings?.is_qb_active;
  });
  const [selectedProductId, setSelectedProductId] = useState(activeQbProducts[0]?.id ?? "");
  const selectedSettings = settingsByProductId.get(selectedProductId);
  const receptionUnits = qbProductAllowedUnits
    .filter(
      (allowedUnit) =>
        allowedUnit.product_id === selectedProductId &&
        allowedUnit.usage_context === "recepcion" &&
        allowedUnit.is_active,
    )
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Card className="border-white/60 bg-card/92 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-xl">
          <PackageOpen className="size-5" />
          Nuevo ingreso
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <FormMessage state={state} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                name="receipt_date"
                type="date"
                defaultValue={getToday()}
                required
                className="rounded-xl"
                disabled={!canManage}
              />
            </div>
            <div className="space-y-2">
              <Label>Referencia interna</Label>
              <Input
                name="reference_code"
                placeholder="Ingreso feria / proveedor"
                className="rounded-xl"
                disabled={!canManage}
              />
            </div>
            <div className="space-y-2">
              <Label>Producto recibido</Label>
              <NativeSelect
                name="product_id"
                value={selectedProductId}
                onChange={(event) => setSelectedProductId(event.target.value)}
                disabled={!canManage || !activeQbProducts.length}
              >
                <option value="">Seleccionar</option>
                {activeQbProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label>Unidad o presentacion de recepcion</Label>
              <NativeSelect
                name="allowed_unit_id"
                defaultValue={receptionUnits[0]?.id ?? ""}
                disabled={!canManage || !receptionUnits.length}
              >
                <option value="">Seleccionar</option>
                {receptionUnits.map((allowedUnit) => (
                  <option key={allowedUnit.id} value={allowedUnit.id}>
                    {allowedUnitLabel(allowedUnit, unitsById, presentationsById)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label>Cantidad recibida</Label>
              <Input
                name="source_quantity"
                type="number"
                min="0.001"
                step="0.001"
                required
                className="rounded-xl"
                disabled={!canManage}
              />
            </div>
            <div className="space-y-2">
              <Label>Costo unitario de ingreso</Label>
              <Input
                name="unit_cost"
                type="number"
                min="0"
                step="0.0001"
                placeholder="Opcional"
                className="rounded-xl"
                disabled={!canManage}
              />
            </div>
            <div className="space-y-2">
              <Label>Clasificacion</Label>
              <NativeSelect
                name="requires_classification"
                defaultValue="false"
                disabled={!canManage || !selectedSettings?.is_classifiable}
              >
                <option value="false">Ingreso directo a inventario</option>
                <option value="true">Clasificar antes de confirmar</option>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label>Origen referencial</Label>
              <Input
                name="supplier_name"
                placeholder="Nombre libre, sin CxP"
                className="rounded-xl"
                disabled={!canManage}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notas</Label>
              <Textarea name="notes" className="rounded-xl" disabled={!canManage} />
            </div>
          </div>
          <Button
            type="submit"
            disabled={pending || !canManage || !selectedProductId || !receptionUnits.length}
            className="rounded-xl"
          >
            <Save className="size-4" />
            {pending ? "Guardando..." : "Crear borrador"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ClassificationForm({
  line,
  outputs,
  canManage,
}: {
  line: QbMerchandiseReceiptLineWithRelations;
  outputs: QbProductClassificationOutput[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    saveQbMerchandiseClassificationAction,
    initialState,
  );
  useActionToast(state);

  const resultByOutputId = new Map(
    line.classification_results
      .filter((result) => result.configured_output_id)
      .map((result) => [result.configured_output_id, result]),
  );
  const classifiedTotal = line.classification_results.reduce(
    (sum, result) => sum + Number(result.base_quantity),
    0,
  );

  return (
    <form action={formAction} className="mt-4 rounded-2xl border border-border/70 bg-slate-50/70 p-4">
      <input type="hidden" name="line_id" value={line.id} />
      <input type="hidden" name="result_count" value={outputs.length} />
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-medium">Clasificacion opcional</p>
          <p className="text-sm text-muted-foreground">
            Base recibida: {formatNumber(line.base_quantity)} {line.base_unit_symbol}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "w-fit rounded-full",
            Math.abs(classifiedTotal - line.base_quantity) <= 0.001
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          Asignado: {formatNumber(classifiedTotal)} {line.base_unit_symbol}
        </Badge>
      </div>
      <FormMessage state={state} />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {outputs.map((output, index) => {
          const existing = resultByOutputId.get(output.id);

          return (
            <div key={output.id} className="space-y-2 rounded-xl border border-border/60 bg-white/70 p-3">
              <input type="hidden" name={`output_id_${index}`} value={output.id} />
              <Label>
                {output.output_type === "loss" ? "Merma" : output.label}
                {output.expected_percentage !== null && output.expected_percentage !== undefined
                  ? ` (${formatNumber(output.expected_percentage)}%)`
                  : ""}
              </Label>
              <Input
                name={`quantity_${index}`}
                type="number"
                min="0"
                step="0.001"
                defaultValue={existing?.base_quantity ?? ""}
                placeholder={`Cantidad en ${line.base_unit_symbol}`}
                className="rounded-xl"
                disabled={!canManage}
              />
            </div>
          );
        })}
      </div>
      {!outputs.length ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Este producto no tiene salidas de clasificacion configuradas en Productos QB.
        </p>
      ) : null}
      <Button type="submit" disabled={pending || !canManage || !outputs.length} className="mt-4 rounded-xl">
        <Split className="size-4" />
        {pending ? "Guardando..." : "Guardar clasificacion"}
      </Button>
    </form>
  );
}

function ReceiptActions({
  receipt,
  canManage,
}: {
  receipt: QbMerchandiseReceiptWithRelations;
  canManage: boolean;
}) {
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmQbMerchandiseReceiptAction,
    initialState,
  );
  const [annulState, annulAction, annulPending] = useActionState(
    annulQbMerchandiseReceiptAction,
    initialState,
  );
  useActionToast(confirmState);
  useActionToast(annulState);

  if (receipt.status !== "borrador") return null;

  return (
    <div className="grid gap-3 border-t border-border/70 pt-4 md:grid-cols-2">
      <form action={confirmAction} className="space-y-2">
        <input type="hidden" name="id" value={receipt.id} />
        <Label>Confirmacion</Label>
        <div className="flex gap-2">
          <Input
            name="confirmation"
            placeholder="CONFIRMAR"
            className="rounded-xl"
            disabled={!canManage}
          />
          <Button type="submit" disabled={confirmPending || !canManage} className="rounded-xl">
            <CheckCircle2 className="size-4" />
            Confirmar
          </Button>
        </div>
        <FormMessage state={confirmState} />
      </form>
      <form action={annulAction} className="space-y-2">
        <input type="hidden" name="id" value={receipt.id} />
        <Label>Anular borrador</Label>
        <div className="flex gap-2">
          <Input name="reason" placeholder="Motivo" className="rounded-xl" disabled={!canManage} />
          <Button type="submit" variant="outline" disabled={annulPending || !canManage} className="rounded-xl">
            <XCircle className="size-4" />
            Anular
          </Button>
        </div>
        <FormMessage state={annulState} />
      </form>
    </div>
  );
}

function ReceiptCard({
  receipt,
  outputsByProductId,
  canManage,
}: {
  receipt: QbMerchandiseReceiptWithRelations;
  outputsByProductId: Map<string, QbProductClassificationOutput[]>;
  canManage: boolean;
}) {
  const directQuantity = receipt.lines
    .flatMap((line) => line.movements)
    .filter((movement) => movement.movement_role !== "loss")
    .reduce((sum, movement) => sum + Number(movement.movement_quantity), 0);
  const lossQuantity = receipt.lines
    .flatMap((line) => line.movements)
    .filter((movement) => movement.movement_role === "loss")
    .reduce((sum, movement) => sum + Number(movement.movement_quantity), 0);

  return (
    <Card className="border-white/60 bg-card/92 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-heading text-xl">
              <ClipboardCheck className="size-5" />
              Ingreso {receipt.reference_code || receipt.id.slice(0, 8)}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {receipt.receipt_date} {receipt.supplier_name ? `- ${receipt.supplier_name}` : ""}
            </p>
          </div>
          <StatusBadge status={receipt.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {receipt.lines.map((line) => {
          const outputs = outputsByProductId.get(line.product_id) ?? [];
          const hasClassificationReady =
            !line.requires_classification ||
            Math.abs(
              line.classification_results.reduce(
                (sum, result) => sum + Number(result.base_quantity),
                0,
              ) - line.base_quantity,
            ) <= 0.001;

          return (
            <div key={line.id} className="rounded-2xl border border-border/70 bg-white/60 p-4">
              <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr]">
                <div>
                  <p className="font-medium">{line.product?.name ?? "Producto"}</p>
                  <p className="text-sm text-muted-foreground">{line.source_label}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Recibido</p>
                  <p className="font-medium">{formatNumber(line.source_quantity)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Base</p>
                  <p className="font-medium">
                    {formatNumber(line.base_quantity)} {line.base_unit_symbol}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Costo separado</p>
                  <p className="font-medium">{formatCurrency(line.total_cost)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {line.requires_classification ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full",
                      hasClassificationReady
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700",
                    )}
                  >
                    <Split className="size-3" />
                    {hasClassificationReady ? "Clasificacion lista" : "Clasificacion pendiente"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50">
                    Ingreso directo
                  </Badge>
                )}
              </div>
              {line.requires_classification && receipt.status === "borrador" ? (
                <ClassificationForm line={line} outputs={outputs} canManage={canManage} />
              ) : null}
              {line.classification_results.length && receipt.status !== "borrador" ? (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {line.classification_results.map((result) => (
                    <div key={result.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-medium">
                        {result.output_type === "loss" ? "Merma" : result.label}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        - {formatNumber(result.base_quantity)} {line.base_unit_symbol}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        {receipt.status === "confirmado" ? (
          <div className="grid gap-3 rounded-2xl bg-emerald-50/70 p-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-emerald-700">Entrada a inventario</p>
              <p className="font-heading text-2xl font-semibold">{formatNumber(directQuantity)}</p>
            </div>
            <div>
              <p className="text-sm text-emerald-700">Merma trazada</p>
              <p className="font-heading text-2xl font-semibold">{formatNumber(lossQuantity)}</p>
            </div>
          </div>
        ) : null}

        <ReceiptActions receipt={receipt} canManage={canManage} />
      </CardContent>
    </Card>
  );
}

export function QbIngresosManagement({
  receipts,
  products,
  qbUnits,
  qbProductUnitSettings,
  qbProductPresentations,
  qbProductAllowedUnits,
  qbProductClassificationOutputs,
  qbParametrizationWarning,
  qbIngresosWarning,
  canManage,
}: QbIngresosManagementProps) {
  const activeProducts = products.filter((product) => product.is_active).length;
  const draftReceipts = receipts.filter((receipt) => receipt.status === "borrador").length;
  const confirmedReceipts = receipts.filter((receipt) => receipt.status === "confirmado").length;
  const classificationPending = receipts.reduce(
    (total, receipt) =>
      total +
      receipt.lines.filter((line) => {
        if (!line.requires_classification || receipt.status !== "borrador") return false;
        const resultTotal = line.classification_results.reduce(
          (sum, result) => sum + Number(result.base_quantity),
          0,
        );
        return Math.abs(resultTotal - line.base_quantity) > 0.001;
      }).length,
    0,
  );
  const outputsByProductId = new Map<string, QbProductClassificationOutput[]>();

  qbProductClassificationOutputs
    .filter((output) => output.is_active)
    .forEach((output) => {
      const current = outputsByProductId.get(output.source_product_id) ?? [];
      current.push(output);
      outputsByProductId.set(output.source_product_id, current);
    });

  const canUseModule = canManage && !qbParametrizationWarning && !qbIngresosWarning;

  return (
    <section className="space-y-6">
      {qbParametrizationWarning ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle className="size-4" />
          <AlertTitle>Parametrizacion QB pendiente</AlertTitle>
          <AlertDescription>{qbParametrizationWarning}</AlertDescription>
        </Alert>
      ) : null}
      {qbIngresosWarning ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle className="size-4" />
          <AlertTitle>Migracion QB-4 pendiente</AlertTitle>
          <AlertDescription>{qbIngresosWarning}</AlertDescription>
        </Alert>
      ) : null}
      {!canManage ? (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Solo lectura</AlertTitle>
          <AlertDescription>Tu rol puede consultar ingresos, pero no crear ni confirmar.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <PackageCheck className="size-4" />
            Productos activos
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">{activeProducts}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="size-4" />
            Borradores
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">{draftReceipts}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Scale className="size-4" />
            Clasificacion pendiente
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">{classificationPending}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            Confirmados
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">{confirmedReceipts}</p>
        </div>
      </div>

      <CreateReceiptForm
        products={products}
        qbProductUnitSettings={qbProductUnitSettings}
        qbProductAllowedUnits={qbProductAllowedUnits}
        qbProductPresentations={qbProductPresentations}
        qbUnits={qbUnits}
        canManage={canUseModule}
      />

      <div className="space-y-4">
        {receipts.map((receipt) => (
          <ReceiptCard
            key={receipt.id}
            receipt={receipt}
            outputsByProductId={outputsByProductId}
            canManage={canUseModule}
          />
        ))}
        {!receipts.length ? (
          <Card className="border-white/60 bg-card/92 shadow-sm">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <PackageOpen className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Aun no hay ingresos QB</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crea el primer borrador cuando la migracion local QB-4 este aplicada.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
