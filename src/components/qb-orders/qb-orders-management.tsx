"use client";

import { useActionState, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  PackageCheck,
  Play,
  Send,
  Truck,
  UserRound,
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
import {
  cancelQbOrderBeforeDeliveryAction,
  confirmQbOrderDeliveryAction,
  saveQbOrderPreparationAction,
  startQbOrderPreparationAction,
} from "@/lib/qb-orders/actions";
import type {
  QbInternalOrder,
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
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(value);
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
  if (status === "cancelado") return "border-slate-200 bg-slate-50 text-slate-700";
  if (status === "recibo_emitido") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "incluido_en_recibo_borrador") return "border-purple-200 bg-purple-50 text-purple-700";
  if (status === "entregado_pendiente_recibo") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "preparado") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "en_preparacion") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-stone-200 bg-stone-50 text-stone-700";
}

function stateMessage(state: QbOrderActionState) {
  if (!state.message) return null;

  return (
    <p className={`rounded-md p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-destructive/5 text-destructive"}`}>
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
    item.allowedUnits.find((unit) => unit.id === item.preparationItem?.actualAllowedUnitId) ??
    item.allowedUnits.find((unit) => unit.isDefault) ??
    item.allowedUnits[0];

  return {
    status: item.preparationItem?.status ?? "no_disponible",
    actualAllowedUnitId: item.preparationItem?.actualAllowedUnitId ?? defaultUnit?.id ?? "",
    actualQuantity:
      item.preparationItem && item.preparationItem.actualQuantity > 0
        ? String(item.preparationItem.actualQuantity)
        : "",
    notes: item.preparationItem?.notes ?? "",
  };
}

function PreparationEditor({
  order,
  action,
  pending,
}: {
  order: QbInternalOrder;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [lines, setLines] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(order.items.map((item) => [item.id, buildInitialLine(item)])),
  );
  const [markPrepared, setMarkPrepared] = useState(true);
  const itemsPayload = useMemo(
    () =>
      JSON.stringify(
        order.items.map((item) => {
          const line = lines[item.id] ?? buildInitialLine(item);
          return {
            orderItemId: item.id,
            status: line.status,
            actualAllowedUnitId: line.status === "no_disponible" ? null : line.actualAllowedUnitId,
            actualQuantity: line.status === "no_disponible" ? 0 : Number(line.actualQuantity || 0),
            notes: line.notes,
          };
        }),
      ),
    [lines, order.items],
  );

  function updateLine(itemId: string, patch: Partial<LineDraft>) {
    setLines((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] ?? buildInitialLine(order.items.find((item) => item.id === itemId)!)), ...patch },
    }));
  }

  return (
    <form action={action} className="rounded-lg border bg-muted/20 p-3">
      <input type="hidden" name="order_id" value={order.id} />
      <input type="hidden" name="items" value={itemsPayload} />
      <input type="hidden" name="mark_prepared" value={markPrepared ? "true" : "false"} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ClipboardCheck className="size-4 text-emerald-700" />
          Checklist de preparacion
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={markPrepared}
            onChange={(event) => setMarkPrepared(event.target.checked)}
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
            <div key={item.id} className="grid gap-3 rounded-md border bg-background p-3 lg:grid-cols-[1fr_150px_150px_150px]">
              <div className="min-w-0">
                <p className="font-medium">{item.productName}</p>
                <p className="text-sm text-muted-foreground">
                  Pedido: {quantity(item.requestedQuantity)} {item.sourceLabel}
                  {" | "}
                  Base: {quantity(item.requestedBaseQuantity)} {item.baseUnitSymbol}
                </p>
                {item.notes ? <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p> : null}
              </div>

              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={line.status}
                  onValueChange={(value) => updateLine(item.id, { status: value as QbPreparationLineStatus })}
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
                  onValueChange={(value) => updateLine(item.id, { actualAllowedUnitId: value })}
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
                  onChange={(event) => updateLine(item.id, { actualQuantity: event.target.value })}
                  disabled={disabled}
                />
              </div>

              <div className="lg:col-span-4">
                <Input
                  value={line.notes}
                  onChange={(event) => updateLine(item.id, { notes: event.target.value })}
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
          rows={2}
        />
      </div>

      <Button type="submit" disabled={pending} className="mt-3">
        <CheckCircle2 className="size-4" />
        {pending ? "Guardando..." : markPrepared ? "Guardar como preparado" : "Guardar preparacion"}
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
}) {
  const canPrepare = order.status === "pendiente_preparacion";
  const canEditPreparation = order.status === "en_preparacion" || order.status === "preparado";
  const canDeliver = order.status === "preparado";
  const canCancel =
    order.status === "pendiente_preparacion" ||
    order.status === "en_preparacion" ||
    order.status === "preparado";

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="font-mono text-base">{order.reference}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{shortDate(order.submittedAt)}</p>
          {order.deliveredAt ? (
            <p className="mt-1 text-xs text-muted-foreground">Entregado: {shortDate(order.deliveredAt)}</p>
          ) : null}
        </div>
        <Badge variant="outline" className={`w-fit rounded-full ${statusBadgeClass(order.status)}`}>
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
            <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
            {order.customerPhone ? (
              <p className="mt-1 text-sm text-muted-foreground">{order.customerPhone}</p>
            ) : null}
          </div>
          <div className="rounded-lg border p-3 md:col-span-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="size-4 text-emerald-700" />
              Ubicacion
            </div>
            <p className="mt-2 font-medium">{order.locationLabel ?? "Sin etiqueta"}</p>
            <p className="text-sm text-muted-foreground">{order.locationAddress ?? "Sin direccion"}</p>
            {order.locationReference ? (
              <p className="mt-1 text-sm text-muted-foreground">{order.locationReference}</p>
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
              <div key={item.id} className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium">{item.productName}</p>
                  {item.notes ? <p className="text-muted-foreground">{item.notes}</p> : null}
                  {item.preparationItem ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Preparado: {quantity(item.preparationItem.actualQuantity)}{" "}
                      {item.preparationItem.actualSourceLabel ?? ""}
                    </p>
                  ) : null}
                </div>
                <p className="font-medium text-muted-foreground">
                  {quantity(item.requestedQuantity)} {item.sourceLabel}
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
            <Button type="submit" disabled={startPending}>
              <Play className="size-4" />
              {startPending ? "Iniciando..." : "Iniciar preparacion"}
            </Button>
          </form>
        ) : null}

        {canEditPreparation ? (
          <PreparationEditor
            key={`${order.id}-${order.status}-${order.preparation?.preparedAt ?? "draft"}`}
            order={order}
            action={saveAction}
            pending={savePending}
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canDeliver ? (
            <form action={deliveryAction}>
              <input type="hidden" name="order_id" value={order.id} />
              <Button type="submit" disabled={deliveryPending}>
                <Truck className="size-4" />
                {deliveryPending ? "Entregando..." : "Confirmar entrega"}
              </Button>
            </form>
          ) : null}

          {canCancel ? (
            <form action={cancelAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="order_id" value={order.id} />
              <Input
                name="reason"
                placeholder="Motivo opcional"
                className="h-9 w-56"
                maxLength={500}
              />
              <Button type="submit" variant="outline" disabled={cancelPending}>
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

export function QbOrdersManagement({
  orders,
  error,
}: {
  orders: QbInternalOrder[];
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
  const pendingOrders = orders.filter((order) => order.status === "pendiente_preparacion");
  const preparingOrders = orders.filter((order) => order.status === "en_preparacion");
  const preparedOrders = orders.filter((order) => order.status === "preparado");
  const deliveredOrders = orders.filter((order) => order.status === "entregado_pendiente_recibo");

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar pedidos QB</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendientes</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{pendingOrders.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">En preparacion</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{preparingOrders.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Preparados</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{preparedOrders.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entregados</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{deliveredOrders.length}</CardContent>
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
            No hay pedidos QB recibidos.
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
            />
          ))}
        </div>
      )}

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Send className="size-4" />
        QB-6 descuenta stock solo al confirmar entrega; los recibos acumulativos quedan para QB-7.
      </p>
    </div>
  );
}
