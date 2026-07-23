"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  confirmMatrixDeliveryAction,
  correctMatrixRequestAction,
  finalizeMatrixPreparationAction,
  reopenMatrixDeliveryAction,
  reorderMatrixOrdersAction,
  saveMatrixDeliveryAction,
  saveMatrixPreparationAction,
} from "@/lib/operational-matrix/actions";
import type {
  MatrixLine,
  MatrixOrder,
  MatrixStage,
  OperationalMatrixData,
} from "@/types/operational-matrix";

const PRODUCT_WIDTH = 220;
const COLUMN_WIDTH = 230;
const HEADER_HEIGHT = 128;
const ROW_HEIGHT = 178;

function idempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(value);
}

function defaultStage(role: OperationalMatrixData["role"]): MatrixStage {
  if (role === "inventario") return "preparacion";
  if (role === "entregador") return "entrega";
  return "pedido";
}

function rowKey(line: MatrixLine) {
  return `${line.productId}:${line.sourceLabel}`;
}

export function OperationalMatrix({ data }: { data: OperationalMatrixData }) {
  const router = useRouter();
  const [stage, setStage] = useState<MatrixStage>(defaultStage(data.role));
  const [lines, setLines] = useState(data.lines);
  const [orders, setOrders] = useState(data.orders);
  const [message, setMessage] = useState<string | null>(null);
  const [remotePending, setRemotePending] = useState(false);
  const [conflictPending, setConflictPending] = useState(false);
  const [selectedMobileOrder, setSelectedMobileOrder] = useState(data.orders[0]?.id ?? "");
  const dirty = useRef(new Set<string>());
  const [viewport, setViewport] = useState({ top: 0, left: 0, width: 900, height: 650 });

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current.size) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (dirty.current.size) {
        setRemotePending(true);
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 350);
    };
    const channel = supabase
      .channel(`qb-matrix-${data.operationalDate}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "qb_orders" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "qb_order_items" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "qb_order_preparation_items" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "qb_order_delivery_items" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "qb_order_delivery_confirmations" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "qb_operational_day_orders" }, onChange)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [data.operationalDate, router]);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    return lines.filter((line) => {
      const key = rowKey(line);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName, "es") ||
      a.productName.localeCompare(b.productName, "es") ||
      a.sourceLabel.localeCompare(b.sourceLabel, "es"),
    );
  }, [lines]);
  const lineMap = useMemo(
    () => new Map(lines.map((line) => [`${rowKey(line)}:${line.orderId}`, line])),
    [lines],
  );

  const rowStart = Math.max(0, Math.floor((viewport.top - HEADER_HEIGHT) / ROW_HEIGHT) - 2);
  const rowEnd = Math.min(rows.length, rowStart + Math.ceil(viewport.height / ROW_HEIGHT) + 5);
  const columnStart = Math.max(0, Math.floor((viewport.left - PRODUCT_WIDTH) / COLUMN_WIDTH) - 1);
  const columnEnd = Math.min(orders.length, columnStart + Math.ceil(viewport.width / COLUMN_WIDTH) + 3);

  const updateLine = (id: string, patch: Partial<MatrixLine>) => {
    dirty.current.add(id);
    setLines((current) =>
      current.map((line) => (line.orderItemId === id ? { ...line, ...patch } : line)),
    );
  };

  const finishSave = (
    id: string,
    result: { success: boolean; message: string; conflict?: boolean; data?: unknown },
    versionField: "preparationVersion" | "deliveryVersion",
  ) => {
    if (result.success) {
      dirty.current.delete(id);
      setMessage("Guardado.");
      if (result.data && typeof result.data === "object") {
        const response = result.data as { row_version?: unknown; order_updated_at?: unknown };
        const version = Number(response.row_version);
        if (Number.isInteger(version)) {
          setLines((current) => current.map((line) =>
            line.orderItemId === id ? { ...line, [versionField]: version } : line,
          ));
        }
        if (typeof response.order_updated_at === "string") {
          const orderId = lines.find((line) => line.orderItemId === id)?.orderId;
          setOrders((current) => current.map((order) =>
            order.id === orderId ? { ...order, updatedAt: response.order_updated_at as string, status: versionField === "preparationVersion" ? "en_preparacion" : order.status } : order,
          ));
        }
      }
    } else {
      setMessage(result.message);
      if (result.conflict) {
        setConflictPending(true);
        setRemotePending(true);
      }
    }
  };

  const savePreparation = async (line: MatrixLine) => {
    const result = await saveMatrixPreparationAction({
      orderItemId: line.orderItemId,
      expectedVersion: line.preparationVersion,
      preparedQuantity: line.preparedQuantity,
      preparationCheck: line.preparationCheck,
      note: line.preparationNote,
      idempotencyKey: idempotencyKey("prep"),
    });
    finishSave(line.orderItemId, result, "preparationVersion");
  };
  const saveDelivery = async (line: MatrixLine) => {
    const result = await saveMatrixDeliveryAction({
      orderItemId: line.orderItemId,
      expectedVersion: line.deliveryVersion,
      externalQuantity: line.externalQuantity,
      deliveredQuantity: line.deliveredQuantity,
      deliveryCheck: line.deliveryCheck,
      note: line.deliveryNote,
      idempotencyKey: idempotencyKey("delivery"),
    });
    finishSave(line.orderItemId, result, "deliveryVersion");
  };

  const moveOrder = async (index: number, delta: number) => {
    const next = [...orders];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrders(next);
    const result = await reorderMatrixOrdersAction({
      operationalDate: data.operationalDate,
      orderIds: next.map((order) => order.id),
      expectedVersions: Object.fromEntries(orders.map((order) => [order.id, order.positionVersion])),
      idempotencyKey: idempotencyKey("reorder"),
    });
    setMessage(result.message);
    if (!result.success) setOrders(orders);
    router.refresh();
  };

  const actionForOrder = async (order: MatrixOrder, action: "prepare" | "confirm" | "reopen") => {
    const common = {
      orderId: order.id,
      expectedUpdatedAt: order.updatedAt,
      idempotencyKey: idempotencyKey(action),
    };
    const result =
      action === "prepare"
        ? await finalizeMatrixPreparationAction(common)
        : action === "confirm"
          ? await confirmMatrixDeliveryAction(common)
          : await reopenMatrixDeliveryAction({
              ...common,
              reason: window.prompt("Motivo de reapertura") ?? "",
            });
    setMessage(result.message);
    router.refresh();
  };

  const canAdmin = data.role === "administrador";
  const visibleStages: MatrixStage[] = canAdmin
    ? ["pedido", "preparacion", "entrega", "resumen"]
    : [defaultStage(data.role)];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border bg-muted p-1" role="tablist" aria-label="Etapa operativa">
          {visibleStages.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={stage === item ? "default" : "ghost"}
              onClick={() => setStage(item)}
              role="tab"
              aria-selected={stage === item}
              className="capitalize"
            >
              {item}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm" aria-live="polite">
          {remotePending ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!dirty.current.size || conflictPending) {
                  dirty.current.clear();
                  setConflictPending(false);
                  router.refresh();
                } else setMessage("Guarda tus cambios antes de actualizar.");
              }}
            >
              <RefreshCw className="size-4" /> {conflictPending ? "Descartar local y actualizar" : "Cambios remotos"}
            </Button>
          ) : null}
          {message ? <span className="text-muted-foreground">{message}</span> : null}
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        {orders.map((order, index) => (
          <div key={order.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{order.customerName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {order.reference}{order.locationLabel ? ` · ${order.locationLabel}` : ""}
              </p>
              {(() => {
                const orderLines = lines.filter((line) => line.orderId === order.id);
                return (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {orderLines.length} solicitadas · {orderLines.filter((line) => line.preparedQuantity > 0).length} preparadas ·{" "}
                    {orderLines.filter((line) => line.deliveryCheck).length} entregadas ·{" "}
                    {orderLines.filter((line) => !line.deliveryCheck).length} pendientes
                  </p>
                );
              })()}
            </div>
            <div className="flex shrink-0 gap-1">
              {canAdmin ? (
                <>
                  <Button size="icon-sm" variant="ghost" aria-label="Mover antes" onClick={() => void moveOrder(index, -1)}>
                    <ChevronLeft />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Mover despues" onClick={() => void moveOrder(index, 1)}>
                    <ChevronRight />
                  </Button>
                </>
              ) : null}
              {(stage === "preparacion" && order.status === "en_preparacion") ||
              (stage === "preparacion" && order.status === "pendiente_preparacion") ? (
                <Button size="sm" onClick={() => void actionForOrder(order, "prepare")}>Finalizar</Button>
              ) : null}
              {stage === "entrega" && order.status === "preparado" ? (
                <Button size="sm" onClick={() => void actionForOrder(order, "confirm")}>Confirmar</Button>
              ) : null}
              {canAdmin && stage === "entrega" && order.deliveryStatus === "confirmado" ? (
                <Button size="sm" variant="outline" onClick={() => void actionForOrder(order, "reopen")}>Reabrir</Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {!orders.length ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No hay pedidos para esta fecha. Los pedidos nuevos se agregan automáticamente y conservan su orden.
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <div
              className="relative h-[650px] overflow-auto rounded-lg border bg-background"
              onScroll={(event) => {
                const target = event.currentTarget;
                setViewport({
                  top: target.scrollTop,
                  left: target.scrollLeft,
                  width: target.clientWidth,
                  height: target.clientHeight,
                });
              }}
              aria-label={`Matriz operativa de ${data.operationalDate}`}
            >
              <div
                className="relative"
                style={{
                  width: PRODUCT_WIDTH + (orders.length + 1) * COLUMN_WIDTH,
                  height: HEADER_HEIGHT + rows.length * ROW_HEIGHT,
                }}
              >
                <div
                  className="absolute z-30 flex items-center border-b border-r bg-muted p-3 font-semibold"
                  style={{ left: viewport.left, top: viewport.top, width: PRODUCT_WIDTH, height: HEADER_HEIGHT }}
                >
                  Producto / unidad
                </div>
                {orders.slice(columnStart, columnEnd).map((order, offset) => (
                  <div
                    key={order.id}
                    className="absolute z-20 border-b border-r bg-muted p-3"
                    style={{
                      left: PRODUCT_WIDTH + (columnStart + offset) * COLUMN_WIDTH,
                      top: viewport.top,
                      width: COLUMN_WIDTH,
                      height: HEADER_HEIGHT,
                    }}
                  >
                    <p className="line-clamp-2 font-semibold">{order.customerName}</p>
                    <p className="mt-1 font-mono text-xs">{order.reference}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{order.locationLabel}</p>
                  </div>
                ))}
                <div
                  className="absolute z-20 border-b border-r bg-primary/10 p-3 font-semibold"
                  style={{
                    left: PRODUCT_WIDTH + orders.length * COLUMN_WIDTH,
                    top: viewport.top,
                    width: COLUMN_WIDTH,
                    height: HEADER_HEIGHT,
                  }}
                >
                  Totales por producto
                  <p className="mt-2 text-xs font-normal text-muted-foreground">Sin mezclar unidades</p>
                </div>
                {rows.slice(rowStart, rowEnd).map((row, rowOffset) => {
                  const absoluteRow = rowStart + rowOffset;
                  const top = HEADER_HEIGHT + absoluteRow * ROW_HEIGHT;
                  return (
                    <div key={rowKey(row)}>
                      <div
                        className="absolute z-10 border-b border-r bg-background p-3"
                        style={{ left: viewport.left, top, width: PRODUCT_WIDTH, height: ROW_HEIGHT }}
                      >
                        <p className="font-medium">{absoluteRow + 1}. {row.productName}</p>
                        <p className="text-xs font-medium text-muted-foreground">{row.categoryName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{row.sourceLabel}</p>
                        <p className="text-xs text-muted-foreground">Base: {row.baseUnitSymbol}</p>
                      </div>
                      {orders.slice(columnStart, columnEnd).map((order, columnOffset) => {
                        const line = lineMap.get(`${rowKey(row)}:${order.id}`);
                        return (
                          <div
                            key={order.id}
                            className="absolute border-b border-r p-3"
                            style={{
                              left: PRODUCT_WIDTH + (columnStart + columnOffset) * COLUMN_WIDTH,
                              top,
                              width: COLUMN_WIDTH,
                              height: ROW_HEIGHT,
                            }}
                          >
                            {line ? (
                              <MatrixCell
                                line={line}
                                stage={stage}
                                canAdmin={canAdmin}
                                onChange={(patch) => updateLine(line.orderItemId, patch)}
                                onSavePreparation={() => void savePreparation(lineMap.get(`${rowKey(row)}:${order.id}`) ?? line)}
                                onSaveDelivery={() => void saveDelivery(lineMap.get(`${rowKey(row)}:${order.id}`) ?? line)}
                                onCorrect={async (requestedQuantity) => {
                                  const reason = window.prompt("Motivo de correccion") ?? "";
                                  const result = await correctMatrixRequestAction({
                                    orderItemId: line.orderItemId,
                                    expectedVersion: line.requestedVersion,
                                    requestedQuantity,
                                    reason,
                                    idempotencyKey: idempotencyKey("request"),
                                  });
                                  const warning =
                                    result.data && typeof result.data === "object"
                                      ? (result.data as { warning?: unknown }).warning
                                      : null;
                                  setMessage(typeof warning === "string" ? warning : result.message);
                                  router.refresh();
                                }}
                              />
                            ) : <span className="text-muted-foreground">—</span>}
                          </div>
                        );
                      })}
                      <div
                        className="absolute border-b border-r bg-primary/5 p-3 text-xs"
                        style={{
                          left: PRODUCT_WIDTH + orders.length * COLUMN_WIDTH,
                          top,
                          width: COLUMN_WIDTH,
                          height: ROW_HEIGHT,
                        }}
                      >
                        {(() => {
                          const rowLines = lines.filter((line) => rowKey(line) === rowKey(row));
                          const total = (field: "requestedQuantity" | "preparedQuantity" | "externalQuantity" | "deliveredQuantity") =>
                            rowLines.reduce((sum, line) => sum + line[field], 0);
                          const requested = total("requestedQuantity");
                          const delivered = total("deliveredQuantity");
                          return (
                            <div className="space-y-1">
                              <p>Solicitado: <strong>{formatQuantity(requested)}</strong></p>
                              <p>Preparado: <strong>{formatQuantity(total("preparedQuantity"))}</strong></p>
                              <p>Externo: <strong>{formatQuantity(total("externalQuantity"))}</strong></p>
                              <p>Entregado: <strong>{formatQuantity(delivered)}</strong></p>
                              <p>Diferencia: <strong>{formatQuantity(delivered - requested)}</strong></p>
                              <p className="text-muted-foreground">{row.sourceLabel}</p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Renderizado virtual: solo se montan las filas y columnas visibles.
            </p>
          </div>

          <div className="space-y-4 md:hidden">
            <label className="block text-sm font-medium">
              Cliente
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                value={selectedMobileOrder}
                onChange={(event) => setSelectedMobileOrder(event.target.value)}
              >
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>{order.customerName} · {order.reference}</option>
                ))}
              </select>
            </label>
            {orders.filter((order) => order.id === selectedMobileOrder).map((order) => (
              <section key={order.id} className="rounded-lg border">
                <header className="border-b bg-muted/50 p-3">
                  <p className="font-semibold">{order.customerName}</p>
                  <p className="text-xs text-muted-foreground">{order.reference} · {order.locationLabel}</p>
                </header>
                <div className="divide-y">
                  {lines.filter((line) => line.orderId === order.id).map((line) => (
                    <div key={line.orderItemId} className="p-3">
                      <p className="font-medium">{line.productName}</p>
                      <p className="mb-3 text-xs text-muted-foreground">{line.sourceLabel}</p>
                      <MatrixCell
                        line={line}
                        stage={stage}
                        canAdmin={canAdmin}
                        onChange={(patch) => updateLine(line.orderItemId, patch)}
                        onSavePreparation={() => void savePreparation(line)}
                        onSaveDelivery={() => void saveDelivery(line)}
                        onCorrect={() => undefined}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MatrixCell({
  line,
  stage,
  canAdmin,
  onChange,
  onSavePreparation,
  onSaveDelivery,
  onCorrect,
}: {
  line: MatrixLine;
  stage: MatrixStage;
  canAdmin: boolean;
  onChange: (patch: Partial<MatrixLine>) => void;
  onSavePreparation: () => void;
  onSaveDelivery: () => void;
  onCorrect: (quantity: number) => void | Promise<void>;
}) {
  if (stage === "pedido") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Solicitado</p>
        <div className="flex items-center gap-2">
          <strong>{formatQuantity(line.requestedQuantity)}</strong>
          <span className="text-xs">{line.sourceLabel}</span>
        </div>
        {canAdmin ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const value = Number(window.prompt("Nueva cantidad solicitada", String(line.requestedQuantity)));
              if (Number.isFinite(value) && value > 0) void onCorrect(value);
            }}
          >
            Corregir con motivo
          </Button>
        ) : null}
      </div>
    );
  }
  if (stage === "preparacion") {
    const missing = Math.max(0, line.requestedQuantity - line.preparedQuantity);
    return (
      <div className="space-y-2">
        <p className="text-xs">
          Solicitado <strong>{formatQuantity(line.requestedQuantity)}</strong> · Faltante{" "}
          <strong>{formatQuantity(missing)}</strong>
        </p>
        <label className="block text-xs">
          Preparado en bodega
          <Input
            className="mt-1 h-8"
            type="number"
            min={0}
            max={line.requestedQuantity}
            step="0.001"
            value={line.preparedQuantity}
            onChange={(event) => onChange({ preparedQuantity: Number(event.target.value) })}
            onBlur={onSavePreparation}
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={line.preparationCheck}
            onChange={(event) => onChange({ preparationCheck: event.target.checked })}
            onBlur={onSavePreparation}
          />
          <Check className="size-3 text-emerald-600" /> Completo
        </label>
        <Input
          className="h-8"
          placeholder="Nota de bodega"
          value={line.preparationNote}
          onChange={(event) => onChange({ preparationNote: event.target.value })}
          onBlur={onSavePreparation}
        />
      </div>
    );
  }
  if (stage === "entrega") {
    const differs = Math.abs(line.deliveredQuantity - line.requestedQuantity) > 0.000001;
    const missing = Math.max(0, line.requestedQuantity - line.preparedQuantity);
    return (
      <div className="space-y-2">
        <p className="text-[11px]">
          Sol. {formatQuantity(line.requestedQuantity)} · Bodega {formatQuantity(line.preparedQuantity)} · Faltante {formatQuantity(missing)}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">Externo
            <Input className="mt-1 h-8" type="number" min={0} step="0.001"
              value={line.externalQuantity}
              onChange={(event) => onChange({ externalQuantity: Number(event.target.value) })}
              onBlur={onSaveDelivery} />
          </label>
          <label className="text-xs">Entregado
            <Input className="mt-1 h-8" type="number" min={0} step="0.001"
              value={line.deliveredQuantity}
              onChange={(event) => onChange({ deliveredQuantity: Number(event.target.value) })}
              onBlur={onSaveDelivery} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={line.deliveryCheck}
            onChange={(event) => onChange({ deliveryCheck: event.target.checked })}
            onBlur={onSaveDelivery} />
          <Check className="size-3 text-blue-600" /> Entrega verificada
        </label>
        <Input className="h-8" placeholder={differs ? "Motivo obligatorio" : "Nota de entrega"}
          value={line.deliveryNote}
          onChange={(event) => onChange({ deliveryNote: event.target.value })}
          onBlur={onSaveDelivery} />
      </div>
    );
  }
  const differs = Math.abs(line.requestedQuantity - line.deliveredQuantity) > 0.000001;
  return (
    <div className="space-y-1 text-xs">
      <p>Solicitado: <strong>{formatQuantity(line.requestedQuantity)}</strong></p>
      <p>Bodega: <strong>{formatQuantity(line.preparedQuantity)}</strong></p>
      <p>Externo: <strong>{formatQuantity(line.externalQuantity)}</strong></p>
      <p>Entregado: <strong>{formatQuantity(line.deliveredQuantity)}</strong></p>
      <p className={differs ? "flex items-center gap-1 text-amber-700" : "flex items-center gap-1 text-emerald-700"}>
        {differs ? <AlertTriangle className="size-3" /> : <Check className="size-3" />}
        {differs ? "Con diferencia" : "Completo"}
      </p>
      <p className="text-muted-foreground">
        Bodega: {line.preparedBy ?? "sin actor"}{line.preparedAt ? ` · ${new Date(line.preparedAt).toLocaleString("es-BO")}` : ""}
      </p>
      <p className="text-muted-foreground">
        Entrega: {line.deliveredBy ?? "sin actor"}{line.deliveredAt ? ` · ${new Date(line.deliveredAt).toLocaleString("es-BO")}` : ""}
      </p>
    </div>
  );
}
