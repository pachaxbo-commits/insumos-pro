"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  CircleDollarSign,
  FileText,
  History,
  ListChecks,
  Printer,
  ReceiptText,
  Save,
  Settings2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ReceiptLineWorkspace } from "@/components/qb-receipts/receipt-line-workspace";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  createQbReceiptDraftAction,
  emitQbReceiptAction,
  setQbReceiptManualTrackingAction,
  setQbReceiptPurchaseCostsAction,
  updateQbReceiptDraftAction,
  voidQbReceiptAction,
} from "@/lib/qb-receipts/actions";
import { formatBoliviaDate } from "@/lib/date-time";
import { summarizeReceipts } from "@/lib/qb-receipts/line-pricing";
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

function isCurrencyLikeUnit(symbol: string) {
  return ["BS", "BOB"].includes(symbol.trim().toUpperCase().replaceAll(".", ""));
}

function deliveredQuantityLabel(line: QbReceiptLine) {
  if (line.inputMode === "amount_bs") {
    return `Pedido por ${money(line.requestedAmountBs ?? line.fixedLineAmount ?? 0)}`;
  }

  if (isCurrencyLikeUnit(line.baseUnitSymbol)) {
    return `${quantity(line.deliveredBaseQuantity)} · unidad por corregir`;
  }

  return `${quantity(line.deliveredBaseQuantity)} ${line.baseUnitSymbol}`;
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
          <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
            <p className="font-semibold">Todavía no hay entregas listas para generar recibo.</p>
            <ol className="list-decimal space-y-1 pl-5 text-sky-900">
              <li>Inventario completa y finaliza la preparación.</li>
              <li>El entregador registra las cantidades reales y confirma la entrega.</li>
              <li>El pedido aparecerá aquí, en “Por crear”.</li>
            </ol>
            <Button asChild variant="outline" className="bg-white">
              <Link href="/matriz-operativa">Abrir preparación y entregas</Link>
            </Button>
          </div>
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
    <div className="space-y-3 rounded-lg border-2 border-indigo-300 bg-indigo-50/40 p-3">
      <div>
        <p className="font-semibold text-indigo-950">
          Tabla solicitada · Costos de compra y utilidad
        </p>
        <p className="text-sm text-indigo-900/75">
          Solo administración. Nunca aparece en el recibo del cliente. Elige la
          unidad usada en esa compra y escribe el valor calculado con el peso real
          de bodega; esto no modifica el pedido ni el precio de venta.
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
  const [draftStep, setDraftStep] = useState("venta");
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
  const linesWithInvalidPhysicalUnit = receipt.lines.filter(
    (line) =>
      line.inputMode === "quantity" &&
      isCurrencyLikeUnit(line.baseUnitSymbol),
  );
  const canEmit =
    !receipt.hasPendingPrices &&
    !hasPendingDraftLines &&
    !hasInvalidDraftLines &&
    linesWithInvalidPhysicalUnit.length === 0 &&
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
    <div className="space-y-4">

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
      {linesWithInvalidPhysicalUnit.length ? (
        <Alert variant="destructive">
          <AlertTitle>No es un error de precio: falta definir la unidad</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              En el pedido de {linesWithInvalidPhysicalUnit.map((line) => line.productName).join(", ")}
              {" "}se guardó “BS” como si fuera una cantidad. “BS” significa bolivianos; el sistema
              no puede adivinar si 0,5 corresponde a kg, libra, unidad u otra medida.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Abre cada producto y elige su unidad física correcta.</li>
              <li>Regresa y anula este borrador.</li>
              <li>Créalo nuevamente para que tome la unidad corregida.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              {linesWithInvalidPhysicalUnit.map((line) => (
                <Button key={line.id} asChild size="sm" variant="outline">
                  <Link href={`/productos?q=${encodeURIComponent(line.productName)}`}>
                    Corregir {line.productName}
                  </Link>
                </Button>
              ))}
              <form action={voidAction}>
                <input type="hidden" name="receipt_id" value={receipt.id} />
                <input
                  type="hidden"
                  name="reason"
                  value="Regenerar después de corregir la unidad de cantidad"
                />
                <Button type="submit" size="sm" variant="outline" disabled={voidPending}>
                  <Ban className="size-4" />
                  {voidPending ? "Anulando..." : "Después de corregir: anular borrador"}
                </Button>
              </form>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={draftStep} onValueChange={setDraftStep} className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start rounded-xl bg-muted/70 p-1">
          <TabsTrigger value="venta" className="min-h-10 flex-none px-4">
            <CircleDollarSign className="size-4" />
            1. Precios de venta
          </TabsTrigger>
          <TabsTrigger value="costos" className="min-h-10 flex-none px-4">
            <ClipboardList className="size-4" />
            2. Costos y utilidad
          </TabsTrigger>
          <TabsTrigger value="emitir" className="min-h-10 flex-none px-4">
            <CheckCircle2 className="size-4" />
            3. Revisar y emitir
          </TabsTrigger>
        </TabsList>

        <TabsContent value="venta">
          <form action={updateAction} className="space-y-4 rounded-xl border bg-muted/15 p-4">
            <input type="hidden" name="receipt_id" value={receipt.id} />
            <input type="hidden" name="lines" value={linesPayload} />

            <section className="rounded-lg border bg-background p-3">
              <div className="flex items-center gap-2 font-medium">
                <Settings2 className="size-4" />
                Ajustes porcentuales del recibo (opcional)
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Se suman y se aplican a todo el recibo, no a productos individuales.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <ReceiptFactorInput receiptId={receipt.id} label="Distancia" name="distance_factor_percent" defaultValue={receipt.distanceFactorPercent} />
                <ReceiptFactorInput receiptId={receipt.id} label="Exigencia" name="exigency_factor_percent" defaultValue={receipt.exigencyFactorPercent} />
                <ReceiptFactorInput receiptId={receipt.id} label="Clima" name="weather_factor_percent" defaultValue={receipt.weatherFactorPercent} />
                <ReceiptFactorInput receiptId={receipt.id} label="Extraordinario" name="extraordinary_factor_percent" defaultValue={receipt.extraordinaryFactorPercent} />
              </div>
            </section>

            <div>
              <h3 className="font-semibold">Define cuánto se cobrará</h3>
              <p className="text-sm text-muted-foreground">
                La cantidad ya viene de la entrega. Escribe únicamente el precio de venta por unidad.
              </p>
            </div>

            <div className="overflow-hidden rounded-lg border bg-background">
              <div className="hidden grid-cols-[minmax(0,1.4fr)_170px_190px_130px] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium text-muted-foreground md:grid">
                <span>Producto</span>
                <span>Cantidad real</span>
                <span>Precio de venta</span>
                <span className="text-right">Total</span>
              </div>
              <div className="divide-y">
                {receipt.lines.map((line) => {
                  const draft = lines[line.id] ?? buildLineDraft(line);
                  const priceState = getDraftPriceState(draft.basePriceUsed);
                  const matchesCurrentPrice = pricesMatch(line.currentBasePrice, draft.basePriceUsed);
                  const savedPriceMatchesDraft =
                    line.basePriceUsed !== null && pricesMatch(line.basePriceUsed, draft.basePriceUsed);
                  const totalLabel =
                    line.inputMode === "amount_bs"
                      ? money(line.fixedLineAmount ?? 0)
                      : priceState === "invalid"
                        ? "Precio inválido"
                        : priceState === "pending"
                          ? "Precio pendiente"
                          : savedPriceMatchesDraft && line.lineTotal !== null && line.lineTotal > 0
                            ? money(line.lineTotal)
                            : "Se calcula al guardar";

                  return (
                    <div key={line.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_170px_190px_130px] md:items-start">
                      <div className="min-w-0">
                        <p className="font-medium">{line.productName}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground md:hidden">Cantidad real</p>
                        <p className={isCurrencyLikeUnit(line.baseUnitSymbol) ? "font-medium text-red-700" : "text-muted-foreground"}>
                          {deliveredQuantityLabel(line)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground md:hidden">Precio de venta</p>
                        {line.inputMode === "quantity" && isCurrencyLikeUnit(line.baseUnitSymbol) ? (
                          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                            Primero corrige la unidad del producto.
                          </div>
                        ) : line.inputMode === "amount_bs" ? (
                          <div className="rounded-md border bg-muted/30 px-3 py-2">
                            <p className="font-medium">Importe fijo</p>
                            <p className="text-xs text-muted-foreground">{money(line.requestedAmountBs ?? 0)}</p>
                            <p className="text-xs text-muted-foreground">Importe fijo; la cantidad real solo afecta inventario.</p>
                            <p className="text-xs text-muted-foreground">El precio y el importe quedan conservados por snapshot.</p>
                          </div>
                        ) : (
                          <Input
                            aria-label={`Precio aplicado para ${line.productName}`}
                            type="number"
                            min="0.5"
                            step="0.5"
                            placeholder="Ej. 25"
                            value={draft.basePriceUsed}
                            onChange={(event) => {
                              const basePriceUsed = event.target.value;
                              const wasValid = getDraftPriceState(draft.basePriceUsed) === "valid";
                              const isValid = getDraftPriceState(basePriceUsed) === "valid";
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
                          <p className="text-xs text-muted-foreground">Bs por {line.currentBasePriceUnitSymbol ?? line.baseUnitSymbol}</p>
                        ) : null}
                      </div>
                      <div className="md:text-right">
                        <p className="text-xs font-medium text-muted-foreground md:hidden">Total</p>
                        <p className="font-semibold">{totalLabel}</p>
                      </div>
                      <details className="text-xs text-muted-foreground md:col-span-4">
                        <summary className="cursor-pointer select-none font-medium text-slate-600">
                          Ver precio anterior y opciones avanzadas
                        </summary>
                        <div className="mt-3 grid gap-3 rounded-lg bg-muted/35 p-3 sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <p className="font-medium text-foreground">Precio actual del producto</p>
                            <p>{line.currentBasePrice === null ? "Este producto todavía no tiene precio base." : `${money(line.currentBasePrice)} por ${line.currentBasePriceUnitSymbol ?? line.baseUnitSymbol}`}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">Precio base equivalente</p>
                            <p>{line.basePricePerArroba === null ? "No se usa para este producto" : `${money(line.basePricePerArroba)} por arroba`}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">Precio base anterior</p>
                            <p>{line.previousBasePricePerArroba !== null ? `${money(line.previousBasePricePerArroba)} por arroba` : line.previousBasePrice !== null ? money(line.previousBasePrice) : "Sin precio anterior"}</p>
                          </div>
                          {line.inputMode === "quantity" && matchesCurrentPrice ? (
                            <p className="font-medium text-emerald-700 sm:col-span-2 lg:col-span-3">
                              El precio aplicado ya coincide con el precio base.
                            </p>
                          ) : null}
                          {line.inputMode === "quantity" && !matchesCurrentPrice ? (
                            <label className="flex items-start gap-2 sm:col-span-2 lg:col-span-3">
                              <input
                                type="checkbox"
                                checked={draft.saveAsNewBasePrice}
                                disabled={priceState !== "valid"}
                                onChange={(event) => updateLine(line.id, { saveAsNewBasePrice: event.target.checked })}
                                className="mt-0.5 size-4"
                              />
                              <span>Guardar este precio como precio base para próximos pedidos.</span>
                            </label>
                          ) : null}
                          {line.inputMode === "quantity" && !matchesCurrentPrice && priceState === "valid" ? (
                            <p className={draft.saveAsNewBasePrice ? "font-medium text-amber-700 sm:col-span-2 lg:col-span-3" : "sm:col-span-2 lg:col-span-3"}>
                              {draft.saveAsNewBasePrice && line.currentBasePrice !== null
                                ? `Confirmas reemplazar ${money(line.currentBasePrice)} por ${money(Number(draft.basePriceUsed))}.`
                                : "Precio excepcional: se usará solo en este recibo."}
                            </p>
                          ) : null}
                          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                            <Label htmlFor={`line-note-${line.id}`} className="text-xs">Nota interna de esta línea</Label>
                            <Input
                              id={`line-note-${line.id}`}
                              value={draft.notes}
                              onChange={(event) => updateLine(line.id, { notes: event.target.value })}
                              placeholder="Opcional"
                            />
                          </div>
                          <p className="font-mono text-[11px] sm:col-span-2 lg:col-span-3">Pedido: {line.orderReference}</p>
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            </div>

            <section className="rounded-lg border bg-background p-3">
              <p className="font-medium">Notas del recibo (opcional)</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nota visible para el cliente</Label>
                  <Textarea name="visible_note" defaultValue={receipt.visibleNote ?? ""} rows={2} />
                  <p className="text-xs text-muted-foreground">Aparece en el documento que se entrega al cliente.</p>
                </div>
                <div className="space-y-2">
                  <Label>Nota interna</Label>
                  <Textarea name="internal_notes" defaultValue={receipt.internalNotes ?? ""} rows={2} />
                  <p className="text-xs text-muted-foreground">Solo la ve administración.</p>
                </div>
              </div>
            </section>

            <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
              <p className="text-sm text-muted-foreground">
                {linesWithInvalidPhysicalUnit.length
                  ? "Corrige las unidades y regenera el borrador antes de continuar."
                  : "Guarda antes de pasar a costos o emitir."}
              </p>
              <Button type="submit" disabled={updatePending || hasInvalidDraftLines || hasInvalidBasePriceUpdates || linesWithInvalidPhysicalUnit.length > 0}>
                <Save className="size-4" />
                {updatePending ? "Guardando..." : "Guardar precios"}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="costos">
          <PurchaseCostEditor receipt={receipt} comparisonUnits={comparisonUnits} />
        </TabsContent>

        <TabsContent value="emitir">
          <div className="space-y-4 rounded-xl border bg-muted/15 p-4">
            <div>
              <h3 className="font-semibold">Revisión final</h3>
              <p className="text-sm text-muted-foreground">Comprueba el documento antes de dejarlo cerrado.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Productos</p>
                <p className="text-xl font-semibold">{receipt.lines.length}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Estado de precios</p>
                <p className="font-semibold">{receipt.hasPendingPrices ? "Faltan precios" : "Completo"}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Total del recibo</p>
                <p className="text-xl font-semibold">{receipt.hasPendingPrices ? "Pendiente" : money(receipt.totalAmount)}</p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href={`/recibos/${receipt.id}`}>
                <Printer className="size-4" />
                Abrir vista previa
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <form action={emitAction}>
                <input type="hidden" name="receipt_id" value={receipt.id} />
                <Button type="submit" disabled={emitPending || !canEmit}>
                  <CheckCircle2 className="size-4" />
                  {emitPending ? "Emitiendo..." : "Emitir recibo"}
                </Button>
              </form>
              {!canEmit ? (
                <p className="text-sm text-muted-foreground">Guarda precios válidos y verifica que el total sea positivo.</p>
              ) : (
                <p className="text-sm text-emerald-700">El recibo está listo para emitirse.</p>
              )}
            </div>
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">Opciones del borrador</summary>
              <form action={voidAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="receipt_id" value={receipt.id} />
                <Input name="reason" placeholder="Motivo opcional" className="h-9 w-60" />
                <Button type="submit" variant="outline" disabled={voidPending}>
                  <Ban className="size-4" />
                  Anular borrador
                </Button>
              </form>
            </details>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReceiptCard({
  receipt,
  relatedReceipts,
  comparisonUnits,
  updateAction,
  updatePending,
  emitAction,
  emitPending,
  voidAction,
  voidPending,
}: {
  receipt: QbReceipt;
  relatedReceipts: QbReceipt[];
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

  return (
    <Card id={`receipt-${receipt.id}`} className="scroll-mt-24">
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
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Pedidos</p>
            <p className="text-xl font-semibold">{receipt.orders.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Productos entregados</p>
            <p className="text-xl font-semibold">{receipt.lines.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-semibold">
              {receipt.hasPendingPrices
                ? receipt.pricingMode === "line_cost_markup" ? "Costo pendiente" : "Precio pendiente"
                : money(receipt.totalAmount)}
            </p>
          </div>
        </div>

        {receipt.pricingMode === "line_cost_markup" ?
          <ReceiptLineWorkspace receipt={receipt} relatedReceipts={relatedReceipts}
            emitAction={emitAction} emitPending={emitPending}
            voidAction={voidAction} voidPending={voidPending} /> : null}
        {receipt.status === "borrador" ? (
          receipt.pricingMode === "line_cost_markup" ? null :
          <details className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-amber-950">
              Borrador anterior · abrir editor histórico
            </summary>
            <p className="my-2 text-xs text-amber-900">
              Este borrador se creó antes del cálculo por producto. Sus factores generales
              pertenecen solo al modelo anterior; los recibos nuevos usan factores por línea.
            </p>
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
          </details>
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
                  <option value="cobrado">Cobrado</option>
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

function ReceiptGeneralSummary({ receipts }: { receipts: QbReceipt[] }) {
  const [customerId, setCustomerId] = useState("all");
  const [month, setMonth] = useState("all");
  const [year, setYear] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const customers = [...new Map(receipts.map((receipt) =>
    [receipt.customerId, receipt.customerName])).entries()];
  const withKnownCosts = receipts.filter((receipt) => receipt.costTotalPrecise !== null
    || (receipt.lines.length > 0 && receipt.lines.every((line) => line.purchaseCostTotal !== null)));
  const rows = withKnownCosts.map((receipt) => ({
    customerId: receipt.customerId,
    date: (receipt.periodEnd ?? receipt.issuedAt ?? receipt.createdAt).slice(0, 10),
    status: receipt.status,
    costTotal: receipt.costTotalPrecise ?? receipt.lines.reduce((sum, line) => sum + (line.purchaseCostTotal ?? 0), 0),
    saleTotal: receipt.saleTotalPrecise ?? receipt.totalAmount,
  }));
  const summary = summarizeReceipts(rows, {
    customerId: customerId === "all" ? undefined : customerId,
    month: month === "all" ? undefined : Number(month),
    year: year === "all" ? undefined : Number(year),
    startDate: startDate || undefined, endDate: endDate || undefined,
  });
  const years = [...new Set(receipts.map((receipt) =>
    (receipt.periodEnd ?? receipt.issuedAt ?? receipt.createdAt).slice(0, 4)))].sort().reverse();
  return <div className="space-y-3 rounded-lg border bg-white p-3">
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <label>Cliente<select className="ml-1 h-8 rounded border px-2" value={customerId}
        onChange={(event) => setCustomerId(event.target.value)}>
        <option value="all">Todos</option>{customers.map(([id,name]) =>
          <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Año<select className="ml-1 h-8 rounded border px-2" value={year}
        onChange={(event) => setYear(event.target.value)}><option value="all">Todos</option>
        {years.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Mes<select className="ml-1 h-8 rounded border px-2" value={month}
        onChange={(event) => setMonth(event.target.value)}><option value="all">Todos</option>
        {Array.from({length: 12},(_,index) => index + 1).map((item) =>
          <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Desde<input type="date" className="ml-1 h-8 rounded border px-2" value={startDate}
        onChange={(event) => setStartDate(event.target.value)} /></label>
      <label>Hasta<input type="date" className="ml-1 h-8 rounded border px-2" value={endDate}
        onChange={(event) => setEndDate(event.target.value)} /></label>
    </div>
    <p className="text-xs text-muted-foreground">Solo recibos emitidos con costo conocido. Los históricos sin costo no se incluyen en utilidad.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-slate-100 text-left text-xs"><tr>
        <th className="px-2 py-2">Cliente</th><th className="px-2 py-2 text-right">Recibos</th>
        <th className="px-2 py-2 text-right">Costo Bs</th><th className="px-2 py-2 text-right">Venta Bs</th>
        <th className="px-2 py-2 text-right">Utilidad Bs</th><th className="px-2 py-2 text-right">% Utilidad</th>
      </tr></thead><tbody>
      {summary.customers.map((item) => <tr key={item.customerId} className="border-t">
        <td className="px-2 py-2">{customers.find(([id]) => id === item.customerId)?.[1] ?? "Cliente"}</td>
        <td className="px-2 py-2 text-right">{item.count}</td>
        <td className="px-2 py-2 text-right">{money(Number(item.costTotal))}</td>
        <td className="px-2 py-2 text-right">{money(Number(item.saleTotal))}</td>
        <td className="px-2 py-2 text-right">{money(Number(item.profitTotal))}</td>
        <td className="px-2 py-2 text-right">{Number(item.marginPercent).toFixed(2)}%</td>
      </tr>)}
      </tbody><tfoot className="border-t bg-emerald-50 font-semibold"><tr>
        <td className="px-2 py-2">TOTAL GENERAL</td><td className="px-2 py-2 text-right">{summary.selected.length}</td>
        <td className="px-2 py-2 text-right">{money(Number(summary.total.costTotal))}</td>
        <td className="px-2 py-2 text-right">{money(Number(summary.total.saleTotal))}</td>
        <td className="px-2 py-2 text-right">{money(Number(summary.total.profitTotal))}</td>
        <td className="px-2 py-2 text-right">{Number(summary.total.marginPercent).toFixed(2)}%</td>
      </tr></tfoot></table></div>
  </div>;
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
                  <td className="px-3 py-2">{receipt.paymentStatus === "cobrado" ? "Cobrado" : receipt.paymentStatus === "pagado" ? "Pagado" : "Pendiente"}</td>
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
  initialSection,
  error,
}: {
  receipts: QbReceipt[];
  pendingGroups: QbReceiptCustomerGroup[];
  comparisonUnits: QbReceiptComparisonUnit[];
  initialSection?: "pendientes" | "borradores" | "emitidos" | "historial" | "general";
  error?: string;
}) {
  const [focusedCustomerId, setFocusedCustomerId] = useState("all");
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
  const issuedReceipts = receipts.filter((receipt) => receipt.status !== "borrador");
  const customerOptions = [...new Map([
    ...receipts.map((receipt) => [receipt.customerId, receipt.customerName] as const),
    ...pendingGroups.map((group) => [group.customerId, group.customerName] as const),
  ]).entries()].sort((a,b) => a[1].localeCompare(b[1], "es"));
  const issuedCount = receipts.filter((receipt) => receipt.status === "emitido").length;
  const pendingCount = pendingGroups.reduce(
    (total, group) => total + group.orders.length,
    0,
  );
  const defaultSection =
    initialSection ??
    (pendingCount > 0 ? "pendientes" : draftCount > 0 ? "borradores" : "emitidos");

  function receiptCards(items: QbReceipt[], emptyMessage: string) {
    const visibleItems = items.filter((receipt) => focusedCustomerId === "all"
      || receipt.customerId === focusedCustomerId);
    if (!visibleItems.length) {
      return (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      );
    }

    return visibleItems.map((receipt) => (
      <ReceiptCard
        key={receipt.id}
        receipt={receipt}
        relatedReceipts={receipts}
        comparisonUnits={comparisonUnits}
        updateAction={updateAction}
        updatePending={updatePending}
        emitAction={emitAction}
        emitPending={emitPending}
        voidAction={voidAction}
        voidPending={voidPending}
      />
    ));
  }

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar los recibos</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}


      <div className="space-y-2">
        {actionMessage(createState)}
        {actionMessage(updateState)}
        {actionMessage(emitState)}
        {actionMessage(voidState)}
      </div>

      <label className="inline-flex items-center gap-2 text-sm">Cliente
        <select className="h-9 max-w-72 rounded border bg-white px-2" value={focusedCustomerId}
          onChange={(event) => setFocusedCustomerId(event.target.value)}>
          <option value="all">Todos los clientes</option>
          {customerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>

      <Tabs defaultValue={defaultSection} className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start rounded-xl bg-muted/70 p-1">
          <TabsTrigger value="pendientes" className="min-h-11 flex-none px-4">
            <ListChecks className="size-4" />
            Por crear
            <Badge variant="secondary" className="ml-1 rounded-full">{pendingCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="borradores" className="min-h-11 flex-none px-4">
            <FileText className="size-4" />
            Borradores
            <Badge variant="secondary" className="ml-1 rounded-full">{draftCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="emitidos" className="min-h-11 flex-none px-4">
            <CheckCircle2 className="size-4" />
            Emitidos
            <Badge variant="secondary" className="ml-1 rounded-full">{issuedCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="historial" className="min-h-11 flex-none px-4">
            <History className="size-4" />
            Historial por cliente
          </TabsTrigger>
          <TabsTrigger value="general" className="min-h-11 flex-none px-4">Resumen general</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Elige un cliente y los pedidos entregados que deseas reunir en un recibo.
          </p>
          <CreateReceiptPanel groups={pendingGroups} action={createAction} pending={createPending} />
        </TabsContent>

        <TabsContent id="borradores" value="borradores" className="scroll-mt-28 space-y-4">
          <p className="text-sm text-muted-foreground">
            Completa precios y costos, revisa el documento y emítelo cuando esté listo.
          </p>
          {receiptCards(receipts.filter((receipt) => receipt.status === "borrador"), "No hay borradores pendientes.")}
        </TabsContent>

        <TabsContent value="emitidos" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Consulta, imprime y registra manualmente si el recibo fue enviado y pagado.
          </p>
          {receiptCards(issuedReceipts, "Todavía no hay recibos emitidos.")}
        </TabsContent>

        <TabsContent value="historial">
          <ReceiptHistoryPanel receipts={receipts} pendingGroups={pendingGroups} />
        </TabsContent>
        <TabsContent value="general"><ReceiptGeneralSummary receipts={receipts} /></TabsContent>
      </Tabs>
    </div>
  );
}
