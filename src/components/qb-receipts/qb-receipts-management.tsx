"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  FileText,
  Percent,
  Printer,
  ReceiptText,
  Save,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createQbReceiptDraftAction,
  emitQbReceiptAction,
  setQbReceiptManualTrackingAction,
  setQbReceiptPurchaseCostsAction,
  updateQbReceiptDraftAction,
  voidQbReceiptAction,
} from "@/lib/qb-receipts/actions";
import { formatBoliviaDate } from "@/lib/date-time";
import type {
  QbReceipt,
  QbReceiptActionState,
  QbReceiptComparisonUnit,
  QbReceiptCustomerGroup,
  QbReceiptLine,
  QbReceiptStatus,
} from "@/types/qb-receipts";

const initialState: QbReceiptActionState = { success: false };

const statusLabels: Record<QbReceiptStatus, string> = {
  borrador: "Borrador",
  emitido: "Emitido",
  anulado: "Anulado",
};

function money(value: number) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    maximumFractionDigits: 2,
  }).format(value);
}

function quantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(
    value,
  );
}

function statusClass(status: QbReceiptStatus) {
  if (status === "emitido")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "anulado")
    return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function actionMessage(state: QbReceiptActionState) {
  if (!state.message) return null;

  return (
    <p
      className={`rounded-md p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-destructive/5 text-destructive"}`}
    >
      {state.message}
      {state.receiptId ? (
        <Link className="ml-2 underline" href={`/recibos/${state.receiptId}`}>
          Ver recibo
        </Link>
      ) : null}
    </p>
  );
}

type LineDraft = {
  basePriceUsed: string;
  saveAsNewBasePrice: boolean;
  notes: string;
};

function buildLineDraft(line: QbReceiptLine): LineDraft {
  return {
    basePriceUsed:
      line.basePriceUsed === null ? "" : String(line.basePriceUsed),
    saveAsNewBasePrice:
      line.currentBasePrice === null && line.saveAsNewBasePrice,
    notes: line.notes ?? "",
  };
}

function getDraftPriceState(value: string): "pending" | "invalid" | "valid" {
  if (!value.trim()) return "pending";
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 99999999
    ? "valid"
    : "invalid";
}

function pricesMatch(left: number | null, right: string) {
  if (left === null || getDraftPriceState(right) !== "valid") return false;
  return Math.abs(left - Number(right)) < 0.000001;
}

function hasAtMostTwoDecimals(value: string) {
  if (getDraftPriceState(value) !== "valid") return false;
  const price = Number(value);
  return Math.abs(price * 100 - Math.round(price * 100)) < 0.00000001;
}

function ReceiptFactorInput({
  receiptId,
  label,
  name,
  defaultValue,
}: {
  receiptId: string;
  label: string;
  name:
    | "distance_factor_percent"
    | "exigency_factor_percent"
    | "weather_factor_percent"
    | "extraordinary_factor_percent";
  defaultValue: number;
}) {
  const inputId = `${name}-${receiptId}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <Input
          id={inputId}
          name={name}
          type="number"
          inputMode="decimal"
          min="0"
          max="1000"
          step="1"
          defaultValue={defaultValue}
          required
          className="pr-9"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          %
        </span>
      </div>
    </div>
  );
}

function CreateReceiptPanel({
  groups,
  action,
  pending,
}: {
  groups: QbReceiptCustomerGroup[];
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [customerId, setCustomerId] = useState(groups[0]?.customerId ?? "");
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const selectedGroup =
    groups.find((group) => group.customerId === customerId) ?? null;

  function toggleOrder(orderId: string) {
    setSelectedOrders((current) =>
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId],
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptText className="size-4 text-emerald-700" />
          Nuevo recibo acumulativo
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!groups.length ? (
          <p className="text-sm text-muted-foreground">
            No hay pedidos entregados pendientes de recibo.
          </p>
        ) : (
          <form action={action} className="space-y-4">
            <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              El recibo incluirá únicamente las cantidades reales confirmadas
              por el entregador.
            </p>
            <input type="hidden" name="customer_id" value={customerId} />
            <input
              type="hidden"
              name="order_ids"
              value={JSON.stringify(selectedOrders)}
            />

            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select
                value={customerId}
                onValueChange={(value) => {
                  setCustomerId(value);
                  setSelectedOrders([]);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.customerId} value={group.customerId}>
                      {group.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Pedidos entregados</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const orderIds = (selectedGroup?.orders ?? []).map(
                      (order) => order.id,
                    );
                    setSelectedOrders(
                      selectedOrders.length === orderIds.length ? [] : orderIds,
                    );
                  }}
                >
                  {selectedOrders.length ===
                  (selectedGroup?.orders.length ?? 0)
                    ? "Quitar selección"
                    : "Seleccionar todos"}
                </Button>
              </div>
              <div className="space-y-2">
                {(selectedGroup?.orders ?? []).map((order) => (
                  <label
                    key={order.id}
                    className="flex items-start gap-3 rounded-md border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedOrders.includes(order.id)}
                      onChange={() => toggleOrder(order.id)}
                      className="mt-1 size-4"
                    />
                    <span className="min-w-0">
                      <span className="block font-mono font-medium">
                        {order.reference}
                      </span>
                      <span className="block text-muted-foreground">
                        {formatBoliviaDate(order.deliveredAt, "short")} ·{" "}
                        {order.deliveredLineCount} lineas entregadas
                      </span>
                      {order.locationLabel ? (
                        <span className="block text-muted-foreground">
                          {order.locationLabel}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={pending || selectedOrders.length === 0}
            >
              <FileText className="size-4" />
              {pending ? "Generando..." : "Generar recibo acumulativo"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

type PurchaseCostDraft = {
  purchaseCostTotal: string;
  referenceUnitId: string;
  referenceValue: string;
};

function buildPurchaseCostDraft(line: QbReceiptLine): PurchaseCostDraft {
  return {
    purchaseCostTotal:
      line.purchaseCostTotal === null ? "" : String(line.purchaseCostTotal),
    referenceUnitId: line.purchaseCostReferenceUnitId ?? "",
    referenceValue:
      line.purchaseCostReferenceValue === null
        ? ""
        : String(line.purchaseCostReferenceValue),
  };
}

function validOptionalCost(value: string) {
  if (!value.trim()) return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

function PurchaseCostEditor({
  receipt,
  comparisonUnits,
}: {
  receipt: QbReceipt;
  comparisonUnits: QbReceiptComparisonUnit[];
}) {
  const [state, action, pending] = useActionState(
    setQbReceiptPurchaseCostsAction,
    initialState,
  );
  const [lines, setLines] = useState<Record<string, PurchaseCostDraft>>(() =>
    Object.fromEntries(
      receipt.lines.map((line) => [line.id, buildPurchaseCostDraft(line)]),
    ),
  );
  const payload = useMemo(
    () =>
      JSON.stringify(
        receipt.lines.map((line) => {
          const draft = lines[line.id] ?? buildPurchaseCostDraft(line);
          return {
            lineId: line.id,
            purchaseCostTotal: draft.purchaseCostTotal,
            referenceUnitId: draft.referenceUnitId,
            referenceValue: draft.referenceValue,
          };
        }),
      ),
    [lines, receipt.lines],
  );
  const invalid = receipt.lines.some((line) => {
    const draft = lines[line.id] ?? buildPurchaseCostDraft(line);
    return (
      !validOptionalCost(draft.purchaseCostTotal) ||
      !validOptionalCost(draft.referenceValue) ||
      (Boolean(draft.referenceUnitId) !== Boolean(draft.referenceValue.trim()))
    );
  });

  function updateLine(lineId: string, patch: Partial<PurchaseCostDraft>) {
    setLines((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] ??
          buildPurchaseCostDraft(
            receipt.lines.find((line) => line.id === lineId)!,
          )),
        ...patch,
      },
    }));
  }

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div>
        <p className="font-semibold text-indigo-950">
          Costos de compra y utilidad · solo administración
        </p>
        <p className="text-sm text-indigo-900/75">
          El costo comparativo es manual: elige la unidad usada en esa compra y
          escribe el valor calculado con el peso real de bodega. No modifica el
          pedido ni el precio de venta.
        </p>
      </div>
      {actionMessage(state)}
      {invalid ? (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          Revisa los importes. La unidad comparativa y su costo deben completarse juntos.
        </p>
      ) : null}
      <form action={action} className="space-y-3">
        <input type="hidden" name="receipt_id" value={receipt.id} />
        <input type="hidden" name="lines" value={payload} />
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Importe vendido</th>
                <th className="px-3 py-2">Costo total compra</th>
                <th className="px-3 py-2">Unidad comparación</th>
                <th className="px-3 py-2">Costo por unidad</th>
                <th className="px-3 py-2">Último costo compra</th>
                <th className="px-3 py-2 text-right">Utilidad</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {receipt.lines.map((line) => {
                const draft = lines[line.id] ?? buildPurchaseCostDraft(line);
                const cost = draft.purchaseCostTotal.trim()
                  ? Number(draft.purchaseCostTotal)
                  : null;
                const profit =
                  cost !== null && Number.isFinite(cost) && line.lineTotal !== null
                    ? line.lineTotal - cost
                    : null;
                return (
                  <tr key={line.id}>
                    <td className="px-3 py-3">
                      <p className="font-medium">{line.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {quantity(line.deliveredBaseQuantity)} {line.baseUnitSymbol}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      {line.lineTotal === null ? "Pendiente" : money(line.lineTotal)}
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        aria-label={`Costo total de compra para ${line.productName}`}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Bs 0,00"
                        value={draft.purchaseCostTotal}
                        onChange={(event) =>
                          updateLine(line.id, {
                            purchaseCostTotal: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        value={draft.referenceUnitId || "none"}
                        onValueChange={(value) =>
                          updateLine(
                            line.id,
                            value === "none"
                              ? { referenceUnitId: "", referenceValue: "" }
                              : { referenceUnitId: value },
                          )
                        }
                      >
                        <SelectTrigger aria-label={`Unidad de comparación para ${line.productName}`}>
                          <SelectValue placeholder="Elegir unidad" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin comparación</SelectItem>
                          {comparisonUnits.map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.name} ({unit.symbol})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        aria-label={`Costo comparativo para ${line.productName}`}
                        type="number"
                        min="0"
                        step="0.0001"
                        placeholder="Bs 0,00"
                        disabled={!draft.referenceUnitId}
                        value={draft.referenceValue}
                        onChange={(event) =>
                          updateLine(line.id, {
                            referenceValue: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {line.previousPurchaseCostReferenceValue === null ? (
                        <span className="text-muted-foreground">Sin anterior</span>
                      ) : (
                        <>
                          <p className="font-medium">
                            {money(line.previousPurchaseCostReferenceValue)}
                          </p>
                          <p className="text-muted-foreground">
                            por {line.previousPurchaseCostReferenceUnitSymbol}
                          </p>
                        </>
                      )}
                    </td>
                    <td className={`px-3 py-3 text-right font-semibold ${profit !== null && profit < 0 ? "text-red-700" : "text-emerald-700"}`}>
                      {profit === null ? "Costo pendiente" : money(profit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button type="submit" variant="outline" disabled={pending || invalid}>
          <Save className="size-4" />
          {pending ? "Guardando costos..." : "Guardar costos de compra"}
        </Button>
      </form>
    </div>
  );
}

function DraftEditor({
  receipt,
  updateAction,
  updatePending,
  emitAction,
  emitPending,
  voidAction,
  voidPending,
  comparisonUnits,
}: {
  receipt: QbReceipt;
  updateAction: (formData: FormData) => void;
  updatePending: boolean;
  emitAction: (formData: FormData) => void;
  emitPending: boolean;
  voidAction: (formData: FormData) => void;
  voidPending: boolean;
  comparisonUnits: QbReceiptComparisonUnit[];
}) {
  const [lines, setLines] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(
      receipt.lines.map((line) => [line.id, buildLineDraft(line)]),
    ),
  );
  const linesPayload = useMemo(
    () =>
      JSON.stringify(
        receipt.lines.map((line) => {
          const draft = lines[line.id] ?? buildLineDraft(line);
          return {
            lineId: line.id,
            basePriceUsed: draft.basePriceUsed,
            expectedBasePrice: line.currentBasePrice,
            saveAsNewBasePrice:
              line.inputMode === "quantity" &&
              draft.saveAsNewBasePrice &&
              !pricesMatch(line.currentBasePrice, draft.basePriceUsed),
            notes: draft.notes,
          };
        }),
      ),
    [lines, receipt.lines],
  );
  const hasPendingDraftLines = receipt.lines.some(
    (line) =>
      getDraftPriceState(
        (lines[line.id] ?? buildLineDraft(line)).basePriceUsed,
      ) === "pending",
  );
  const hasInvalidDraftLines = receipt.lines.some(
    (line) =>
      getDraftPriceState(
        (lines[line.id] ?? buildLineDraft(line)).basePriceUsed,
      ) === "invalid",
  );
  const hasInvalidBasePriceUpdates = receipt.lines.some((line) => {
    const draft = lines[line.id] ?? buildLineDraft(line);
    return (
      draft.saveAsNewBasePrice &&
      !pricesMatch(line.currentBasePrice, draft.basePriceUsed) &&
      !hasAtMostTwoDecimals(draft.basePriceUsed)
    );
  });
  const canEmit =
    !receipt.hasPendingPrices &&
    !hasPendingDraftLines &&
    !hasInvalidDraftLines &&
    receipt.lines.length > 0 &&
    receipt.subtotalAmount > 0 &&
    receipt.totalAmount > 0;

  function updateLine(lineId: string, patch: Partial<LineDraft>) {
    setLines((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] ??
          buildLineDraft(receipt.lines.find((line) => line.id === lineId)!)),
        ...patch,
      },
    }));
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      {receipt.hasPendingPrices ||
      hasPendingDraftLines ||
      hasInvalidDraftLines ||
      hasInvalidBasePriceUpdates ? (
        <Alert>
          <AlertTitle>
            {hasInvalidDraftLines || hasInvalidBasePriceUpdates
              ? "Revisa los precios"
              : "Precios pendientes"}
          </AlertTitle>
          <AlertDescription>
            {hasInvalidDraftLines
              ? "Cada precio escrito debe ser un número positivo válido."
              : hasInvalidBasePriceUpdates
                ? "Un precio que se guardará como precio base debe tener como máximo dos decimales."
                : "Puedes guardar el borrador con precios pendientes y completarlos posteriormente."}
          </AlertDescription>
        </Alert>
      ) : null}
      <form action={updateAction} className="space-y-4">
        <input type="hidden" name="receipt_id" value={receipt.id} />
        <input type="hidden" name="lines" value={linesPayload} />

        <div className="grid gap-3 md:grid-cols-4">
          <ReceiptFactorInput
            receiptId={receipt.id}
            label="Distancia"
            name="distance_factor_percent"
            defaultValue={receipt.distanceFactorPercent}
          />
          <ReceiptFactorInput
            receiptId={receipt.id}
            label="Exigencia"
            name="exigency_factor_percent"
            defaultValue={receipt.exigencyFactorPercent}
          />
          <ReceiptFactorInput
            receiptId={receipt.id}
            label="Clima"
            name="weather_factor_percent"
            defaultValue={receipt.weatherFactorPercent}
          />
          <ReceiptFactorInput
            receiptId={receipt.id}
            label="Extraordinario"
            name="extraordinary_factor_percent"
            defaultValue={receipt.extraordinaryFactorPercent}
          />
        </div>

        <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          El precio base es el precio de venta antes de aplicar los factores del
          recibo. El costo de compra se manejará por separado para no mezclar
          costo, venta y utilidad.
        </p>

        <div className="rounded-md border bg-background">
          <div className="grid gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground xl:grid-cols-[1.2fr_120px_130px_130px_130px_170px_1.2fr_110px]">
            <span>Producto</span>
            <span>Cantidad entregada</span>
            <span>Precio base actual</span>
            <span>Precio base equivalente</span>
            <span>Precio base anterior</span>
            <span>Precio base aplicado</span>
            <span>Uso futuro</span>
            <span>Subtotal final</span>
          </div>
          <div className="divide-y">
            {receipt.lines.map((line) => {
              const draft = lines[line.id] ?? buildLineDraft(line);
              const priceState = getDraftPriceState(draft.basePriceUsed);
              const matchesCurrentPrice = pricesMatch(
                line.currentBasePrice,
                draft.basePriceUsed,
              );
              const savedPriceMatchesDraft =
                line.basePriceUsed !== null &&
                pricesMatch(line.basePriceUsed, draft.basePriceUsed);
              return (
                <div
                  key={line.id}
                  className="grid gap-3 px-3 py-4 text-sm xl:grid-cols-[1.2fr_120px_130px_130px_130px_170px_1.2fr_110px]"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{line.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.orderReference}
                    </p>
                  </div>
                  <p className="text-muted-foreground">
                    {quantity(line.deliveredBaseQuantity)} {line.baseUnitSymbol}
                  </p>
                  <div className="text-xs">
                    {line.inputMode === "amount_bs" ? (
                      <>
                        <p className="font-medium">
                          {money(line.originalBasePrice ?? 0)}
                        </p>
                        <p className="text-muted-foreground">
                          referencia congelada por{" "}
                          {line.pricingUnitSymbol ?? line.baseUnitSymbol}
                        </p>
                      </>
                    ) : line.currentBasePrice === null ? (
                      <p className="font-medium text-amber-700">
                        Este producto todavía no tiene precio base.
                      </p>
                    ) : (
                      <>
                        <p className="font-medium">
                          {money(line.currentBasePrice)}
                        </p>
                        <p className="text-muted-foreground">
                          por{" "}
                          {line.currentBasePriceUnitSymbol ??
                            line.baseUnitSymbol}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="text-xs">
                    {line.basePricePerArroba === null ? (
                      <p className="text-muted-foreground">No aplica</p>
                    ) : (
                      <>
                        <p className="font-medium">{money(line.basePricePerArroba)}</p>
                        <p className="text-muted-foreground">por arroba (venta)</p>
                      </>
                    )}
                  </div>
                  <div className="text-xs">
                    {line.previousBasePricePerArroba !== null ? (
                      <>
                        <p className="font-medium">{money(line.previousBasePricePerArroba)}</p>
                        <p className="text-muted-foreground">por arroba (venta)</p>
                      </>
                    ) : line.previousBasePrice !== null ? (
                      <p className="font-medium">{money(line.previousBasePrice)}</p>
                    ) : (
                      <p className="text-muted-foreground">Sin anterior</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    {line.inputMode === "amount_bs" ? (
                      <div className="rounded-xl border bg-muted/35 px-3 py-2">
                        <p className="font-medium">
                          Pedido por Bs {money(line.requestedAmountBs ?? 0)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Importe fijo; la cantidad real solo afecta inventario.
                        </p>
                      </div>
                    ) : (
                      <Input
                        aria-label={`Precio aplicado para ${line.productName}`}
                        type="number"
                        min="0.5"
                        step="0.5"
                        placeholder="Ingresa el precio"
                        value={draft.basePriceUsed}
                        onChange={(event) => {
                          const basePriceUsed = event.target.value;
                          const wasValid =
                            getDraftPriceState(draft.basePriceUsed) === "valid";
                          const isValid =
                            getDraftPriceState(basePriceUsed) === "valid";
                          updateLine(line.id, {
                            basePriceUsed,
                            ...(isValid
                              ? line.currentBasePrice === null && !wasValid
                                ? { saveAsNewBasePrice: true }
                                : {}
                              : { saveAsNewBasePrice: false }),
                          });
                        }}
                      />
                    )}
                    {line.inputMode === "quantity" ? (
                      <p className="text-xs text-muted-foreground">
                        Bs por{" "}
                        {line.currentBasePriceUnitSymbol ?? line.baseUnitSymbol}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2 text-xs">
                    {line.inputMode === "amount_bs" ? (
                      <p className="font-medium text-emerald-700">
                        El precio y el importe quedan conservados por snapshot.
                      </p>
                    ) : matchesCurrentPrice ? (
                      <p className="font-medium text-emerald-700">
                        El precio aplicado ya coincide con el precio base.
                      </p>
                    ) : (
                      <>
                        <label className="flex items-start gap-2 text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={draft.saveAsNewBasePrice}
                            disabled={priceState !== "valid"}
                            onChange={(event) =>
                              updateLine(line.id, {
                                saveAsNewBasePrice: event.target.checked,
                              })
                            }
                            className="mt-0.5 size-4"
                          />
                          <span>
                            Guardar este precio como base para próximos recibos.
                          </span>
                        </label>
                        {line.currentBasePrice !== null &&
                        priceState === "valid" ? (
                          <p
                            className={
                              draft.saveAsNewBasePrice
                                ? "font-medium text-amber-700"
                                : "text-muted-foreground"
                            }
                          >
                            {draft.saveAsNewBasePrice
                              ? `Confirmas reemplazar ${money(line.currentBasePrice)} por ${money(Number(draft.basePriceUsed))}.`
                              : "Precio excepcional: se usará solo en este recibo."}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                  <p className="font-medium">
                    {line.inputMode === "amount_bs"
                      ? money(line.fixedLineAmount ?? 0)
                      : priceState === "invalid"
                        ? "Precio inválido"
                        : priceState === "pending"
                          ? "Precio pendiente"
                          : savedPriceMatchesDraft &&
                              line.lineTotal !== null &&
                              line.lineTotal > 0
                            ? money(line.lineTotal)
                            : "Se calcula al guardar"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nota visible</Label>
            <Textarea
              name="visible_note"
              defaultValue={receipt.visibleNote ?? ""}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Notas internas</Label>
            <Textarea
              name="internal_notes"
              defaultValue={receipt.internalNotes ?? ""}
              rows={2}
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={
            updatePending || hasInvalidDraftLines || hasInvalidBasePriceUpdates
          }
        >
          <Save className="size-4" />
          {updatePending ? "Guardando..." : "Guardar borrador"}
        </Button>
      </form>

      <PurchaseCostEditor
        receipt={receipt}
        comparisonUnits={comparisonUnits}
      />

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <form action={emitAction}>
          <input type="hidden" name="receipt_id" value={receipt.id} />
          <Button type="submit" disabled={emitPending || !canEmit}>
            <CheckCircle2 className="size-4" />
            {emitPending ? "Emitiendo..." : "Emitir recibo"}
          </Button>
        </form>
        {!canEmit ? (
          <p className="self-center text-sm text-muted-foreground">
            La emisión se habilitará cuando todas las líneas tengan precios
            válidos y el total sea positivo.
          </p>
        ) : null}
        <form action={voidAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="receipt_id" value={receipt.id} />
          <Input
            name="reason"
            placeholder="Motivo opcional en borrador"
            className="h-9 w-60"
          />
          <Button type="submit" variant="outline" disabled={voidPending}>
            <Ban className="size-4" />
            Anular
          </Button>
        </form>
      </div>
    </div>
  );
}

function ReceiptCard({
  receipt,
  comparisonUnits,
  updateAction,
  updatePending,
  emitAction,
  emitPending,
  voidAction,
  voidPending,
}: {
  receipt: QbReceipt;
  comparisonUnits: QbReceiptComparisonUnit[];
  updateAction: (formData: FormData) => void;
  updatePending: boolean;
  emitAction: (formData: FormData) => void;
  emitPending: boolean;
  voidAction: (formData: FormData) => void;
  voidPending: boolean;
}) {
  const [trackingState, trackingAction, trackingPending] = useActionState(
    setQbReceiptManualTrackingAction,
    initialState,
  );
  const hasCompletePurchaseCosts =
    receipt.lines.length > 0 &&
    receipt.lines.every((line) => line.purchaseCostTotal !== null);
  const purchaseCostTotal = receipt.lines.reduce(
    (sum, line) => sum + (line.purchaseCostTotal ?? 0),
    0,
  );
  const profitTotal = hasCompletePurchaseCosts
    ? receipt.totalAmount - purchaseCostTotal
    : null;

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="font-mono text-base">
            {receipt.number}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {receipt.customerName}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatBoliviaDate(receipt.periodStart, "short")} -{" "}
            {formatBoliviaDate(receipt.periodEnd, "short")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={`rounded-full ${statusClass(receipt.status)}`}
          >
            {statusLabels[receipt.status]}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href={`/recibos/${receipt.id}`}>
              <Printer className="size-4" />
              Vista
            </Link>
          </Button>
          {receipt.status !== "anulado" ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/recibos/${receipt.id}/nota-entrega`}>
                <ClipboardList className="size-4" />
                Sin precios
              </Link>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Pedidos</p>
            <p className="text-xl font-semibold">{receipt.orders.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Lineas</p>
            <p className="text-xl font-semibold">{receipt.lines.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Subtotal</p>
            <p className="text-xl font-semibold">
              {receipt.hasPendingPrices
                ? "Precio pendiente"
                : money(receipt.subtotalAmount)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-semibold">
              {receipt.hasPendingPrices
                ? "Precio pendiente"
                : money(receipt.totalAmount)}
            </p>
          </div>
          <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
            <p className="text-xs text-muted-foreground">
              Costo compra · interno
            </p>
            <p className="text-xl font-semibold">
              {hasCompletePurchaseCosts
                ? money(purchaseCostTotal)
                : "Costo pendiente"}
            </p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-xs text-muted-foreground">
              Utilidad · interno
            </p>
            <p
              className={`text-xl font-semibold ${profitTotal !== null && profitTotal < 0 ? "text-red-700" : "text-emerald-700"}`}
            >
              {profitTotal === null ? "Costo pendiente" : money(profitTotal)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1">
            <Percent className="size-3" />
            Distancia {receipt.distanceFactorPercent}%
          </span>
          <span className="rounded-full border px-2 py-1">
            Exigencia {receipt.exigencyFactorPercent}%
          </span>
          <span className="rounded-full border px-2 py-1">
            Clima {receipt.weatherFactorPercent}%
          </span>
          <span className="rounded-full border px-2 py-1">
            Extraordinario {receipt.extraordinaryFactorPercent}%
          </span>
        </div>

        {receipt.status === "borrador" ? (
          <DraftEditor
            receipt={receipt}
            updateAction={updateAction}
            updatePending={updatePending}
            emitAction={emitAction}
            emitPending={emitPending}
            voidAction={voidAction}
            voidPending={voidPending}
            comparisonUnits={comparisonUnits}
          />
        ) : receipt.status === "emitido" ? (
          <div className="space-y-3">
            {actionMessage(trackingState)}
            <form action={trackingAction} className="grid gap-3 rounded-lg border bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <input type="hidden" name="receipt_id" value={receipt.id} />
              <label className="space-y-1 text-sm font-medium">
                Recibo entregado al cliente
                <select name="receipt_sent" defaultValue={receipt.receiptSentAt ? "true" : "false"} className="block h-10 w-full rounded-md border bg-white px-3 text-sm">
                  <option value="false">No enviado</option>
                  <option value="true">Enviado</option>
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium">
                Estado de pago manual
                <select name="payment_status" defaultValue={receipt.paymentStatus} className="block h-10 w-full rounded-md border bg-white px-3 text-sm">
                  <option value="pendiente">Pendiente</option>
                  <option value="pagado">Pagado</option>
                </select>
              </label>
              <Button type="submit" disabled={trackingPending}>
                <Save className="size-4" />
                {trackingPending ? "Guardando..." : "Guardar control"}
              </Button>
              <p className="text-xs text-muted-foreground md:col-span-3">
                Control informativo y manual; no registra caja, transferencia ni movimiento financiero.
              </p>
            </form>
            <form action={voidAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="receipt_id" value={receipt.id} />
              <Input
                name="reason"
                required
                placeholder="Motivo de anulacion"
                className="h-9 w-72"
              />
              <Button type="submit" variant="outline" disabled={voidPending}>
                <Ban className="size-4" />
                Anular emitido
              </Button>
            </form>
          </div>
        ) : (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Anulado: {receipt.voidReason ?? "Sin motivo visible"}
          </p>
        )}

        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No constituye factura fiscal ni comprobante de pago.
        </p>
      </CardContent>
    </Card>
  );
}

function currentBoliviaMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function ReceiptHistoryPanel({
  receipts,
  pendingGroups,
}: {
  receipts: QbReceipt[];
  pendingGroups: QbReceiptCustomerGroup[];
}) {
  const customers = useMemo(() => {
    const values = new Map<string, string>();
    receipts.forEach((receipt) => values.set(receipt.customerId, receipt.customerName));
    pendingGroups.forEach((group) => values.set(group.customerId, group.customerName));
    return [...values.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, "es"));
  }, [pendingGroups, receipts]);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [month, setMonth] = useState(currentBoliviaMonth);
  const receiptRows = receipts.filter((receipt) => {
    const date = receipt.periodEnd ?? receipt.issuedAt ?? receipt.createdAt;
    return receipt.customerId === customerId && date?.slice(0, 7) === month;
  });
  const pendingRows =
    pendingGroups
      .find((group) => group.customerId === customerId)
      ?.orders.filter((order) => order.deliveredAt?.slice(0, 7) === month) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial mensual por cliente</CardTitle>
        <p className="text-sm text-muted-foreground">
          Muestra pedidos entregados pendientes y recibos acumulados. El control de envío y pago es manual.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            Cliente
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="block h-10 w-full rounded-md border bg-white px-3 text-sm">
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            Mes
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Registro</th>
                <th className="px-3 py-2">Pedidos incluidos</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Enviado</th>
                <th className="px-3 py-2">Pago</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pendingRows.map((order) => (
                <tr key={`pending:${order.id}`}>
                  <td className="px-3 py-2">{formatBoliviaDate(order.deliveredAt, "short")}</td>
                  <td className="px-3 py-2 font-medium">Pendiente de recibo</td>
                  <td className="px-3 py-2 font-mono text-xs">{order.reference}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">Por calcular</td>
                  <td className="px-3 py-2 text-muted-foreground">No aplica</td>
                  <td className="px-3 py-2">Pendiente</td>
                </tr>
              ))}
              {receiptRows.map((receipt) => (
                <tr key={`receipt:${receipt.id}`}>
                  <td className="px-3 py-2">{formatBoliviaDate(receipt.issuedAt ?? receipt.createdAt, "short")}</td>
                  <td className="px-3 py-2">
                    <Link href={`/recibos/${receipt.id}`} className="font-mono font-medium underline-offset-2 hover:underline">{receipt.number}</Link>
                    <p className="text-xs text-muted-foreground">{statusLabels[receipt.status]}</p>
                  </td>
                  <td className="max-w-80 px-3 py-2 font-mono text-xs">{receipt.orders.map((order) => order.orderReference).join(", ")}</td>
                  <td className="px-3 py-2 text-right font-semibold">{receipt.hasPendingPrices ? "Precio pendiente" : money(receipt.totalAmount)}</td>
                  <td className="px-3 py-2">{receipt.receiptSentAt ? "Enviado" : "No enviado"}</td>
                  <td className="px-3 py-2">{receipt.paymentStatus === "pagado" ? "Pagado" : "Pendiente"}</td>
                </tr>
              ))}
              {!pendingRows.length && !receiptRows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No hay registros para este cliente y mes.</td>
                </tr>
              ) : null}
            </tbody>
            <tfoot className="bg-emerald-50 font-semibold">
              <tr>
                <td colSpan={3} className="px-3 py-2">Total de recibos emitidos no anulados</td>
                <td className="px-3 py-2 text-right">
                  {money(receiptRows.filter((receipt) => receipt.status === "emitido" && !receipt.hasPendingPrices).reduce((sum, receipt) => sum + receipt.totalAmount, 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function QbReceiptsManagement({
  receipts,
  pendingGroups,
  comparisonUnits,
  error,
}: {
  receipts: QbReceipt[];
  pendingGroups: QbReceiptCustomerGroup[];
  comparisonUnits: QbReceiptComparisonUnit[];
  error?: string;
}) {
  const [createState, createAction, createPending] = useActionState(
    createQbReceiptDraftAction,
    initialState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateQbReceiptDraftAction,
    initialState,
  );
  const [emitState, emitAction, emitPending] = useActionState(
    emitQbReceiptAction,
    initialState,
  );
  const [voidState, voidAction, voidPending] = useActionState(
    voidQbReceiptAction,
    initialState,
  );
  const draftCount = receipts.filter(
    (receipt) => receipt.status === "borrador",
  ).length;
  const issuedCount = receipts.filter(
    (receipt) => receipt.status === "emitido",
  ).length;

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar los recibos</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {pendingGroups.reduce(
              (total, group) => total + group.orders.length,
              0,
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Borradores
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {draftCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Emitidos
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {issuedCount}
          </CardContent>
        </Card>
      </div>

      <ReceiptHistoryPanel receipts={receipts} pendingGroups={pendingGroups} />

      <div className="space-y-2">
        {actionMessage(createState)}
        {actionMessage(updateState)}
        {actionMessage(emitState)}
        {actionMessage(voidState)}
      </div>

      <CreateReceiptPanel
        groups={pendingGroups}
        action={createAction}
        pending={createPending}
      />

      <div className="space-y-4">
        {receipts.length ? (
          receipts.map((receipt) => (
            <ReceiptCard
              key={receipt.id}
              receipt={receipt}
              comparisonUnits={comparisonUnits}
              updateAction={updateAction}
              updatePending={updatePending}
              emitAction={emitAction}
              emitPending={emitPending}
              voidAction={voidAction}
              voidPending={voidPending}
            />
          ))
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No hay recibos creados.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
