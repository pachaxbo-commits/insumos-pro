"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
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
  updateQbReceiptDraftAction,
  voidQbReceiptAction,
} from "@/lib/qb-receipts/actions";
import { formatBoliviaDate } from "@/lib/date-time";
import type {
  QbReceipt,
  QbReceiptActionState,
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
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(value);
}

function statusClass(status: QbReceiptStatus) {
  if (status === "emitido") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "anulado") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function actionMessage(state: QbReceiptActionState) {
  if (!state.message) return null;

  return (
    <p className={`rounded-md p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-destructive/5 text-destructive"}`}>
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
    basePriceUsed: line.basePriceUsed === null ? "" : String(line.basePriceUsed),
    saveAsNewBasePrice: line.currentBasePrice === null && line.saveAsNewBasePrice,
    notes: line.notes ?? "",
  };
}

function getDraftPriceState(value: string): "pending" | "invalid" | "valid" {
  if (!value.trim()) return "pending";
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 99999999 ? "valid" : "invalid";
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
  const selectedGroup = groups.find((group) => group.customerId === customerId) ?? null;

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
          Nuevo recibo
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!groups.length ? (
          <p className="text-sm text-muted-foreground">
            No hay pedidos entregados pendientes de recibo.
          </p>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="customer_id" value={customerId} />
            <input type="hidden" name="order_ids" value={JSON.stringify(selectedOrders)} />

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
              <Label>Pedidos entregados</Label>
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
                      <span className="block font-mono font-medium">{order.reference}</span>
                      <span className="block text-muted-foreground">
                        {formatBoliviaDate(order.deliveredAt, "short")} ·{" "}
                        {order.deliveredLineCount} lineas entregadas
                      </span>
                      {order.locationLabel ? (
                        <span className="block text-muted-foreground">{order.locationLabel}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={pending || selectedOrders.length === 0}>
              <FileText className="size-4" />
              {pending ? "Creando..." : "Crear borrador"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
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
}: {
  receipt: QbReceipt;
  updateAction: (formData: FormData) => void;
  updatePending: boolean;
  emitAction: (formData: FormData) => void;
  emitPending: boolean;
  voidAction: (formData: FormData) => void;
  voidPending: boolean;
}) {
  const [lines, setLines] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(receipt.lines.map((line) => [line.id, buildLineDraft(line)])),
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
              draft.saveAsNewBasePrice
              && !pricesMatch(line.currentBasePrice, draft.basePriceUsed),
            notes: draft.notes,
          };
        }),
      ),
    [lines, receipt.lines],
  );
  const hasPendingDraftLines = receipt.lines.some(
    (line) => getDraftPriceState((lines[line.id] ?? buildLineDraft(line)).basePriceUsed) === "pending",
  );
  const hasInvalidDraftLines = receipt.lines.some(
    (line) => getDraftPriceState((lines[line.id] ?? buildLineDraft(line)).basePriceUsed) === "invalid",
  );
  const hasInvalidBasePriceUpdates = receipt.lines.some((line) => {
    const draft = lines[line.id] ?? buildLineDraft(line);
    return draft.saveAsNewBasePrice
      && !pricesMatch(line.currentBasePrice, draft.basePriceUsed)
      && !hasAtMostTwoDecimals(draft.basePriceUsed);
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
      [lineId]: { ...(current[lineId] ?? buildLineDraft(receipt.lines.find((line) => line.id === lineId)!)), ...patch },
    }));
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      {receipt.hasPendingPrices || hasPendingDraftLines || hasInvalidDraftLines || hasInvalidBasePriceUpdates ? (
        <Alert>
          <AlertTitle>{hasInvalidDraftLines || hasInvalidBasePriceUpdates ? "Revisa los precios" : "Precios pendientes"}</AlertTitle>
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
          <div className="space-y-2">
            <Label>Distancia %</Label>
            <Input name="distance_factor_percent" type="number" step="0.001" defaultValue={receipt.distanceFactorPercent} />
          </div>
          <div className="space-y-2">
            <Label>Exigencia %</Label>
            <Input name="exigency_factor_percent" type="number" step="0.001" defaultValue={receipt.exigencyFactorPercent} />
          </div>
          <div className="space-y-2">
            <Label>Clima %</Label>
            <Input name="weather_factor_percent" type="number" step="0.001" defaultValue={receipt.weatherFactorPercent} />
          </div>
          <div className="space-y-2">
            <Label>Extraordinario %</Label>
            <Input name="extraordinary_factor_percent" type="number" step="0.001" defaultValue={receipt.extraordinaryFactorPercent} />
          </div>
        </div>

        <div className="rounded-md border bg-background">
          <div className="grid gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground lg:grid-cols-[1.2fr_130px_150px_180px_1.4fr_120px]">
            <span>Producto</span>
            <span>Cantidad entregada</span>
            <span>Precio base actual</span>
            <span>Precio aplicado</span>
            <span>Uso futuro</span>
            <span>Subtotal final</span>
          </div>
          <div className="divide-y">
            {receipt.lines.map((line) => {
              const draft = lines[line.id] ?? buildLineDraft(line);
              const priceState = getDraftPriceState(draft.basePriceUsed);
              const matchesCurrentPrice = pricesMatch(line.currentBasePrice, draft.basePriceUsed);
              const savedPriceMatchesDraft =
                line.basePriceUsed !== null
                && pricesMatch(line.basePriceUsed, draft.basePriceUsed);
              return (
                <div key={line.id} className="grid gap-3 px-3 py-4 text-sm lg:grid-cols-[1.2fr_130px_150px_180px_1.4fr_120px]">
                  <div className="min-w-0">
                    <p className="font-medium">{line.productName}</p>
                    <p className="text-xs text-muted-foreground">{line.orderReference}</p>
                  </div>
                  <p className="text-muted-foreground">
                    {quantity(line.deliveredBaseQuantity)} {line.baseUnitSymbol}
                  </p>
                  <div className="text-xs">
                    {line.currentBasePrice === null ? (
                      <p className="font-medium text-amber-700">Este producto todavía no tiene precio base.</p>
                    ) : (
                      <>
                        <p className="font-medium">{money(line.currentBasePrice)}</p>
                        <p className="text-muted-foreground">por {line.currentBasePriceUnitSymbol ?? line.baseUnitSymbol}</p>
                      </>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Input
                      aria-label={`Precio aplicado para ${line.productName}`}
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      placeholder="Ingresa el precio"
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
                    <p className="text-xs text-muted-foreground">Bs por {line.currentBasePriceUnitSymbol ?? line.baseUnitSymbol}</p>
                  </div>
                  <div className="space-y-2 text-xs">
                    {matchesCurrentPrice ? (
                      <p className="font-medium text-emerald-700">El precio aplicado ya coincide con el precio base.</p>
                    ) : (
                      <>
                        <label className="flex items-start gap-2 text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={draft.saveAsNewBasePrice}
                            disabled={priceState !== "valid"}
                            onChange={(event) => updateLine(line.id, { saveAsNewBasePrice: event.target.checked })}
                            className="mt-0.5 size-4"
                          />
                          <span>Guardar este precio como precio base para próximos pedidos.</span>
                        </label>
                        {line.currentBasePrice !== null && priceState === "valid" ? (
                          <p className={draft.saveAsNewBasePrice ? "font-medium text-amber-700" : "text-muted-foreground"}>
                            {draft.saveAsNewBasePrice
                              ? `Confirmas reemplazar ${money(line.currentBasePrice)} por ${money(Number(draft.basePriceUsed))}.`
                              : "Precio excepcional: se usará solo en este recibo."}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                  <p className="font-medium">
                    {priceState === "invalid"
                      ? "Precio inválido"
                      : priceState === "pending"
                        ? "Precio pendiente"
                        : savedPriceMatchesDraft && line.lineTotal !== null && line.lineTotal > 0
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
            <Textarea name="visible_note" defaultValue={receipt.visibleNote ?? ""} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Notas internas</Label>
            <Textarea name="internal_notes" defaultValue={receipt.internalNotes ?? ""} rows={2} />
          </div>
        </div>

        <Button type="submit" disabled={updatePending || hasInvalidDraftLines || hasInvalidBasePriceUpdates}>
          <Save className="size-4" />
          {updatePending ? "Guardando..." : "Guardar borrador"}
        </Button>
      </form>

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
            La emisión se habilitará cuando todas las líneas tengan precios válidos y el total sea positivo.
          </p>
        ) : null}
        <form action={voidAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="receipt_id" value={receipt.id} />
          <Input name="reason" placeholder="Motivo opcional en borrador" className="h-9 w-60" />
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
  updateAction,
  updatePending,
  emitAction,
  emitPending,
  voidAction,
  voidPending,
}: {
  receipt: QbReceipt;
  updateAction: (formData: FormData) => void;
  updatePending: boolean;
  emitAction: (formData: FormData) => void;
  emitPending: boolean;
  voidAction: (formData: FormData) => void;
  voidPending: boolean;
}) {
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="font-mono text-base">{receipt.number}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{receipt.customerName}</p>
          <p className="text-xs text-muted-foreground">
            {formatBoliviaDate(receipt.periodStart, "short")} -{" "}
            {formatBoliviaDate(receipt.periodEnd, "short")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`rounded-full ${statusClass(receipt.status)}`}>
            {statusLabels[receipt.status]}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href={`/recibos/${receipt.id}`}>
              <Printer className="size-4" />
              Vista
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
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
              {receipt.hasPendingPrices ? "Precio pendiente" : money(receipt.subtotalAmount)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-semibold">
              {receipt.hasPendingPrices ? "Precio pendiente" : money(receipt.totalAmount)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1">
            <Percent className="size-3" />
            Distancia {receipt.distanceFactorPercent}%
          </span>
          <span className="rounded-full border px-2 py-1">Exigencia {receipt.exigencyFactorPercent}%</span>
          <span className="rounded-full border px-2 py-1">Clima {receipt.weatherFactorPercent}%</span>
          <span className="rounded-full border px-2 py-1">Extraordinario {receipt.extraordinaryFactorPercent}%</span>
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
          />
        ) : receipt.status === "emitido" ? (
          <form action={voidAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="receipt_id" value={receipt.id} />
            <Input name="reason" required placeholder="Motivo de anulacion" className="h-9 w-72" />
            <Button type="submit" variant="outline" disabled={voidPending}>
              <Ban className="size-4" />
              Anular emitido
            </Button>
          </form>
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

export function QbReceiptsManagement({
  receipts,
  pendingGroups,
  error,
}: {
  receipts: QbReceipt[];
  pendingGroups: QbReceiptCustomerGroup[];
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
  const draftCount = receipts.filter((receipt) => receipt.status === "borrador").length;
  const issuedCount = receipts.filter((receipt) => receipt.status === "emitido").length;

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
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendientes</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {pendingGroups.reduce((total, group) => total + group.orders.length, 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Borradores</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{draftCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Emitidos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{issuedCount}</CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        {actionMessage(createState)}
        {actionMessage(updateState)}
        {actionMessage(emitState)}
        {actionMessage(voidState)}
      </div>

      <CreateReceiptPanel groups={pendingGroups} action={createAction} pending={createPending} />

      <div className="space-y-4">
        {receipts.length ? (
          receipts.map((receipt) => (
            <ReceiptCard
              key={receipt.id}
              receipt={receipt}
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
