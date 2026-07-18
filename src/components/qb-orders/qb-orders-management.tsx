"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Ban,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  PackageCheck,
  Play,
  RefreshCw,
  Send,
  Truck,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { InternalOrderCreator } from "@/components/qb-orders/internal-order-creator";
import {
  useQbOrdersSynchronization,
  type QbOrdersSyncStatus,
} from "@/components/qb-orders/use-qb-orders-synchronization";
import {
  cancelQbOrderBeforeDeliveryAction,
  confirmQbOrderDeliveryAction,
  saveQbOrderPreparationAction,
  startQbOrderPreparationAction,
} from "@/lib/qb-orders/actions";
import type {
  QbInternalOrder,
  QbInternalOrderCreationData,
  QbInternalOrderItem,
  QbOrderActionState,
  QbPreparationLineStatus,
} from "@/types/qb-orders";
import type { QbOrderStatus } from "@/types/qb-catalog";

const initialState: QbOrderActionState = { success: false };

const statusLabels: Record<QbOrderStatus, string> = {
  pendiente_preparacion: "Pendiente preparacion",
  en_preparacion: "En preparacion",
  preparado: "Preparado",
  entregado_pendiente_recibo: "Entregado pendiente recibo",
  incluido_en_recibo_borrador: "Incluido en recibo borrador",
  recibo_emitido: "Recibo emitido",
  cancelado: "Cancelado",
};

const lineStatusLabels: Record<QbPreparationLineStatus, string> = {
  completo: "Completo",
  parcial: "Parcial",
  no_disponible: "No disponible",
};

function quantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(
    value,
  );
}

function bolivianos(value: number) {
  return new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function amountDeviationIsSignificant(item: QbInternalOrderItem) {
  if (
    item.inputMode !== "amount_bs" ||
    !item.preparationItem ||
    !item.estimatedBaseQuantity
  ) {
    return false;
  }
  return (
    Math.abs(
      item.preparationItem.actualBaseQuantity - item.estimatedBaseQuantity,
    ) /
      item.estimatedBaseQuantity >=
    0.1
  );
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("es-BO", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function statusBadgeClass(status: QbOrderStatus) {
  if (status === "cancelado")
    return "border-slate-200 bg-slate-50 text-slate-700";
  if (status === "recibo_emitido")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "incluido_en_recibo_borrador")
    return "border-purple-200 bg-purple-50 text-purple-700";
  if (status === "entregado_pendiente_recibo")
    return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "preparado")
    return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "en_preparacion")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-stone-200 bg-stone-50 text-stone-700";
}

function stateMessage(state: QbOrderActionState) {
  if (!state.message) return null;

  return (
    <p
      className={`rounded-md p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-destructive/5 text-destructive"}`}
    >
      {state.message}
    </p>
  );
}

type LineDraft = {
  status: QbPreparationLineStatus;
  actualAllowedUnitId: string;
  actualQuantity: string;
  notes: string;
};

function buildInitialLine(item: QbInternalOrderItem): LineDraft {
  const defaultUnit =
    item.allowedUnits.find(
      (unit) => unit.id === item.preparationItem?.actualAllowedUnitId,
    ) ??
    item.allowedUnits.find((unit) => unit.isDefault) ??
    item.allowedUnits[0];

  return {
    status: item.preparationItem?.status ?? "no_disponible",
    actualAllowedUnitId:
      item.preparationItem?.actualAllowedUnitId ?? defaultUnit?.id ?? "",
    actualQuantity:
      item.preparationItem && item.preparationItem.actualQuantity > 0
        ? String(item.preparationItem.actualQuantity)
        : "",
    notes: item.preparationItem?.notes ?? "",
  };
}

function deliveryWouldLeaveNegative(order: QbInternalOrder) {
  const deliveredByProduct = new Map<
    string,
    { stockCurrent: number; deliveredQuantity: number }
  >();

  for (const item of order.items) {
    const preparationItem = item.preparationItem;
    if (!preparationItem || preparationItem.status === "no_disponible")
      continue;

    const current = deliveredByProduct.get(item.productId) ?? {
      stockCurrent: item.stockCurrent,
      deliveredQuantity: 0,
    };
    current.deliveredQuantity += preparationItem.actualBaseQuantity;
    deliveredByProduct.set(item.productId, current);
  }

  return [...deliveredByProduct.values()].some(
    ({ stockCurrent, deliveredQuantity }) =>
      stockCurrent - deliveredQuantity < 0,
  );
}

function PreparationEditor({
  order,
  action,
  pending,
  synchronizationBlocked,
  onDirtyChange,
}: {
  order: QbInternalOrder;
  action: (formData: FormData) => void;
  pending: boolean;
  synchronizationBlocked: boolean;
  onDirtyChange: (orderId: string, dirty: boolean) => void;
}) {
  const [lines, setLines] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(
      order.items.map((item) => [item.id, buildInitialLine(item)]),
    ),
  );
  const [markPrepared, setMarkPrepared] = useState(true);
  useEffect(
    () => () => onDirtyChange(order.id, false),
    [onDirtyChange, order.id],
  );
  const itemsPayload = useMemo(
    () =>
      JSON.stringify(
        order.items.map((item) => {
          const line = lines[item.id] ?? buildInitialLine(item);
          return {
            orderItemId: item.id,
            status: line.status,
            actualAllowedUnitId:
              line.status === "no_disponible" ? null : line.actualAllowedUnitId,
            actualQuantity:
              line.status === "no_disponible"
                ? 0
                : Number(line.actualQuantity || 0),
            notes: line.notes,
          };
        }),
      ),
    [lines, order.items],
  );

  function updateLine(itemId: string, patch: Partial<LineDraft>) {
    onDirtyChange(order.id, true);
    setLines((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ??
          buildInitialLine(order.items.find((item) => item.id === itemId)!)),
        ...patch,
      },
    }));
  }

  return (
    <form action={action} className="rounded-lg border bg-muted/20 p-3">
      <input type="hidden" name="order_id" value={order.id} />
      <input type="hidden" name="expected_updated_at" value={order.updatedAt} />
      <input type="hidden" name="items" value={itemsPayload} />
      <input
        type="hidden"
        name="mark_prepared"
        value={markPrepared ? "true" : "false"}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ClipboardCheck className="size-4 text-emerald-700" />
          Checklist de preparacion
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={markPrepared}
            onChange={(event) => {
              onDirtyChange(order.id, true);
              setMarkPrepared(event.target.checked);
            }}
            className="size-4"
          />
          Marcar preparado
        </label>
      </div>

      <div className="mt-3 space-y-3">
        {order.items.map((item) => {
          const line = lines[item.id] ?? buildInitialLine(item);
          const disabled = line.status === "no_disponible";

          return (
            <div
              key={item.id}
              className="grid gap-3 rounded-md border bg-background p-3 lg:grid-cols-[1fr_150px_150px_150px]"
            >
              <div className="min-w-0">
                <p className="font-medium">{item.productName}</p>
                <p className="text-sm text-muted-foreground">
                  {item.inputMode === "amount_bs"
                    ? `Pedido: Bs ${bolivianos(item.requestedAmountBs ?? 0)} | Preparar aproximadamente: ${quantity(item.estimatedBaseQuantity ?? item.requestedBaseQuantity)} ${item.baseUnitSymbol} | Precio de referencia: Bs ${bolivianos((item.requestedAmountBs ?? 0) / (item.estimatedBaseQuantity || 1))} por ${item.baseUnitSymbol}`
                    : `Pedido: ${quantity(item.requestedQuantity)} ${item.sourceLabel}`}
                  {" | "}
                  Base: {quantity(item.requestedBaseQuantity)}{" "}
                  {item.baseUnitSymbol}
                </p>
                {item.notes ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.notes}
                  </p>
                ) : null}
                {amountDeviationIsSignificant(item) ? (
                  <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                    La cantidad real difiere al menos 10% de la estimación.
                    Verifica el pesaje; el importe solicitado no cambiará.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={line.status}
                  onValueChange={(value) =>
                    updateLine(item.id, {
                      status: value as QbPreparationLineStatus,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(lineStatusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Unidad</Label>
                <Select
                  value={line.actualAllowedUnitId}
                  onValueChange={(value) =>
                    updateLine(item.id, { actualAllowedUnitId: value })
                  }
                  disabled={disabled || item.allowedUnits.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {item.allowedUnits.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cantidad real</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={disabled ? "0" : line.actualQuantity}
                  onChange={(event) =>
                    updateLine(item.id, { actualQuantity: event.target.value })
                  }
                  disabled={disabled}
                />
              </div>

              <div className="lg:col-span-4">
                <Input
                  value={line.notes}
                  onChange={(event) =>
                    updateLine(item.id, { notes: event.target.value })
                  }
                  placeholder="Nota interna opcional"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-2">
        <Label htmlFor={`notes-${order.id}`}>Notas internas</Label>
        <Textarea
          id={`notes-${order.id}`}
          name="internal_notes"
          defaultValue={order.preparation?.internalNotes ?? ""}
          onChange={() => onDirtyChange(order.id, true)}
          rows={2}
        />
      </div>

      {synchronizationBlocked ? (
        <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          El pedido cambió en otro dispositivo. Actualiza la vista antes de
          guardar esta preparación.
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending || synchronizationBlocked}
        className="mt-3"
      >
        <CheckCircle2 className="size-4" />
        {pending
          ? "Guardando..."
          : markPrepared
            ? "Guardar como preparado"
            : "Guardar preparacion"}
      </Button>
    </form>
  );
}

function OrderCard({
  order,
  startAction,
  startPending,
  saveAction,
  savePending,
  deliveryAction,
  deliveryPending,
  cancelAction,
  cancelPending,
  synchronizationBlocked,
  editorResetToken,
  onDirtyChange,
  strictStockControl,
}: {
  order: QbInternalOrder;
  startAction: (formData: FormData) => void;
  startPending: boolean;
  saveAction: (formData: FormData) => void;
  savePending: boolean;
  deliveryAction: (formData: FormData) => void;
  deliveryPending: boolean;
  cancelAction: (formData: FormData) => void;
  cancelPending: boolean;
  synchronizationBlocked: boolean;
  editorResetToken: number;
  onDirtyChange: (orderId: string, dirty: boolean) => void;
  strictStockControl: boolean;
}) {
  const [negativeStockConfirmed, setNegativeStockConfirmed] = useState(false);
  const canPrepare = order.status === "pendiente_preparacion";
  const canEditPreparation =
    order.status === "en_preparacion" || order.status === "preparado";
  const canDeliver = order.status === "preparado";
  const willLeaveNegativeStock =
    canDeliver && deliveryWouldLeaveNegative(order);
  const canCancel =
    order.status === "pendiente_preparacion" ||
    order.status === "en_preparacion" ||
    order.status === "preparado";

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="font-mono text-base">
            {order.reference}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {shortDate(order.submittedAt)}
          </p>
          {order.deliveredAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Entregado: {shortDate(order.deliveredAt)}
            </p>
          ) : null}
        </div>
        <Badge
          variant="outline"
          className={`w-fit rounded-full ${statusBadgeClass(order.status)}`}
        >
          {statusLabels[order.status]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserRound className="size-4 text-emerald-700" />
              Cliente
            </div>
            <p className="mt-2 font-medium">{order.customerName}</p>
            <p className="text-sm text-muted-foreground">
              {order.customerEmail}
            </p>
            {order.customerPhone ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {order.customerPhone}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border p-3 md:col-span-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="size-4 text-emerald-700" />
              Ubicacion
            </div>
            <p className="mt-2 font-medium">
              {order.locationLabel ?? "Sin etiqueta"}
            </p>
            <p className="text-sm text-muted-foreground">
              {order.locationAddress ?? "Sin direccion"}
            </p>
            {order.locationReference ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {order.locationReference}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
            <PackageCheck className="size-4 text-emerald-700" />
            Productos solicitados
          </div>
          <div className="divide-y">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-medium">{item.productName}</p>
                  {item.notes ? (
                    <p className="text-muted-foreground">{item.notes}</p>
                  ) : null}
                  {item.preparationItem ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Preparado: {quantity(item.preparationItem.actualQuantity)}{" "}
                      {item.preparationItem.actualSourceLabel ?? ""}
                    </p>
                  ) : null}
                </div>
                <p className="font-medium text-muted-foreground">
                  {item.inputMode === "amount_bs"
                    ? `Bs ${bolivianos(item.requestedAmountBs ?? 0)} · estimado ${quantity(item.estimatedRequestedQuantity ?? item.requestedQuantity)} ${item.sourceLabel}`
                    : `${quantity(item.requestedQuantity)} ${item.sourceLabel}`}
                </p>
              </div>
            ))}
          </div>
        </div>

        {order.customerNotes ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {order.customerNotes}
          </p>
        ) : null}

        {canPrepare ? (
          <form action={startAction}>
            <input type="hidden" name="order_id" value={order.id} />
            <input
              type="hidden"
              name="expected_updated_at"
              value={order.updatedAt}
            />
            <Button
              type="submit"
              disabled={startPending || synchronizationBlocked}
            >
              <Play className="size-4" />
              {startPending ? "Iniciando..." : "Iniciar preparacion"}
            </Button>
          </form>
        ) : null}

        {canEditPreparation ? (
          <PreparationEditor
            key={`${order.id}-${order.status}-${order.preparation?.preparedAt ?? "draft"}-${editorResetToken}`}
            order={order}
            action={saveAction}
            pending={savePending}
            synchronizationBlocked={synchronizationBlocked}
            onDirtyChange={onDirtyChange}
          />
        ) : null}

        {willLeaveNegativeStock ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <AlertTitle>
              {strictStockControl
                ? "Entrega bloqueada por stock"
                : "Saldo provisional"}
            </AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                {strictStockControl
                  ? "La cantidad preparada supera la existencia disponible. Ajusta la preparación o registra el ingreso correspondiente antes de entregar."
                  : "El stock registrado es insuficiente. Puedes continuar con la entrega; el saldo quedará provisional hasta registrar el ingreso correspondiente."}
              </p>
              {!strictStockControl ? (
                <label className="flex items-start gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={negativeStockConfirmed}
                    onChange={(event) =>
                      setNegativeStockConfirmed(event.target.checked)
                    }
                    className="mt-0.5 size-4"
                  />
                  Confirmo que deseo continuar con la entrega.
                </label>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canDeliver ? (
            <form action={deliveryAction}>
              <input type="hidden" name="order_id" value={order.id} />
              <input
                type="hidden"
                name="expected_updated_at"
                value={order.updatedAt}
              />
              <Button
                type="submit"
                disabled={
                  deliveryPending ||
                  synchronizationBlocked ||
                  (willLeaveNegativeStock &&
                    (strictStockControl || !negativeStockConfirmed))
                }
              >
                <Truck className="size-4" />
                {deliveryPending ? "Entregando..." : "Confirmar entrega"}
              </Button>
            </form>
          ) : null}

          {canCancel ? (
            <form action={cancelAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="order_id" value={order.id} />
              <input
                type="hidden"
                name="expected_updated_at"
                value={order.updatedAt}
              />
              <Input
                name="reason"
                placeholder="Motivo opcional"
                className="h-9 w-56"
                maxLength={500}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={cancelPending || synchronizationBlocked}
              >
                <Ban className="size-4" />
                Cancelar
              </Button>
            </form>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

const syncStatusLabels: Record<QbOrdersSyncStatus, string> = {
  connecting: "Conectando",
  live: "Sincronización activa",
  polling: "Actualización periódica activa",
  offline: "Sin conexión",
  stale: "Cambios remotos pendientes",
};

function SynchronizationStatus({
  status,
  lastUpdatedAt,
  isRefreshing,
  onRefresh,
}: {
  status: QbOrdersSyncStatus;
  lastUpdatedAt: number;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(intervalId);
  }, []);
  const elapsedSeconds = Math.max(0, Math.floor((now - lastUpdatedAt) / 1_000));
  const updatedLabel =
    elapsedSeconds < 10
      ? "Actualizado hace unos segundos"
      : `Actualizado hace ${elapsedSeconds} segundos`;
  const online = status !== "offline";
  const freshnessLabel = online
    ? updatedLabel
    : "Los datos visibles pueden estar desactualizados";

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm">
        {online ? (
          <Wifi className="size-4 text-emerald-700" />
        ) : (
          <WifiOff className="size-4 text-amber-700" />
        )}
        <div>
          <p className="font-medium">{syncStatusLabels[status]}</p>
          <p className="text-xs text-muted-foreground">{freshnessLabel}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
        {isRefreshing ? "Actualizando..." : "Actualizar"}
      </Button>
    </div>
  );
}

export function QbOrdersManagement({
  orders,
  creation,
  canCreateOrder,
  strictStockControl,
  error,
}: {
  orders: QbInternalOrder[];
  creation?: QbInternalOrderCreationData;
  canCreateOrder: boolean;
  strictStockControl: boolean;
  error?: string;
}) {
  const [startState, startAction, startPending] = useActionState(
    startQbOrderPreparationAction,
    initialState,
  );
  const [saveState, saveAction, savePending] = useActionState(
    saveQbOrderPreparationAction,
    initialState,
  );
  const [deliveryState, deliveryAction, deliveryPending] = useActionState(
    confirmQbOrderDeliveryAction,
    initialState,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelQbOrderBeforeDeliveryAction,
    initialState,
  );
  const [dirtyOrderIds, setDirtyOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [editorResetToken, setEditorResetToken] = useState(0);
  const mutationPending =
    startPending || savePending || deliveryPending || cancelPending;
  const synchronization = useQbOrdersSynchronization({
    hasUnsavedChanges: dirtyOrderIds.size > 0,
    mutationPending,
  });
  const markSynchronizationConflict = synchronization.markConflict;
  const handleDirtyChange = useCallback((orderId: string, dirty: boolean) => {
    setDirtyOrderIds((current) => {
      const next = new Set(current);
      if (dirty) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }, []);

  useEffect(() => {
    const actionStates = [startState, saveState, deliveryState, cancelState];
    if (actionStates.some((state) => state.refreshRequired)) {
      markSynchronizationConflict();
    }
  }, [
    cancelState,
    deliveryState,
    markSynchronizationConflict,
    saveState,
    startState,
  ]);

  useEffect(() => {
    if (!saveState.success || !saveState.orderId) return;
    const savedOrderId = saveState.orderId;
    const timerId = window.setTimeout(() => {
      setDirtyOrderIds((current) => {
        const next = new Set(current);
        next.delete(savedOrderId);
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [saveState]);
  const pendingOrders = orders.filter(
    (order) => order.status === "pendiente_preparacion",
  );
  const preparingOrders = orders.filter(
    (order) => order.status === "en_preparacion",
  );
  const preparedOrders = orders.filter((order) => order.status === "preparado");
  const deliveredOrders = orders.filter(
    (order) => order.status === "entregado_pendiente_recibo",
  );

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar los pedidos</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <SynchronizationStatus
        status={synchronization.status}
        lastUpdatedAt={synchronization.lastUpdatedAt}
        isRefreshing={synchronization.isRefreshing}
        onRefresh={() => synchronization.refreshManually()}
      />

      {synchronization.status === "offline" ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTitle>Sin conexión</AlertTitle>
          <AlertDescription>
            Conservamos los pedidos visibles, pero no podemos afirmar que estén
            actualizados. La vista se actualizará al recuperar la conexión.
          </AlertDescription>
        </Alert>
      ) : null}

      {synchronization.remoteChangePending ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTitle>El pedido cambió en otro dispositivo</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Conservamos tus entradas sin guardar. Para evitar un conflicto,
              descártalas y carga el estado vigente antes de confirmar.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDirtyOrderIds(new Set());
                setEditorResetToken((current) => current + 1);
                synchronization.discardAndRefresh();
              }}
            >
              Descartar cambios y actualizar
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {canCreateOrder && creation ? (
        <InternalOrderCreator {...creation} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {pendingOrders.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              En preparacion
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {preparingOrders.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Preparados
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {preparedOrders.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Entregados
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {deliveredOrders.length}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        {stateMessage(startState)}
        {stateMessage(saveState)}
        {stateMessage(deliveryState)}
        {stateMessage(cancelState)}
      </div>

      {!orders.length ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No hay pedidos recibidos.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              startAction={startAction}
              startPending={startPending}
              saveAction={saveAction}
              savePending={savePending}
              deliveryAction={deliveryAction}
              deliveryPending={deliveryPending}
              cancelAction={cancelAction}
              cancelPending={cancelPending}
              synchronizationBlocked={synchronization.remoteChangePending}
              editorResetToken={editorResetToken}
              onDirtyChange={handleDirtyChange}
              strictStockControl={strictStockControl}
            />
          ))}
        </div>
      )}

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Send className="size-4" />
        El inventario se descuenta al confirmar la entrega; después, el pedido
        queda disponible para su recibo acumulativo.
      </p>
    </div>
  );
}
