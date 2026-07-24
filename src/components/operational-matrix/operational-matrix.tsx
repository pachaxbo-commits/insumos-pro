"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

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

function idempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-BO", {
    maximumFractionDigits: 3,
  }).format(value);
}

function defaultStage(role: OperationalMatrixData["role"]): MatrixStage {
  if (role === "inventario") return "preparacion";
  if (role === "entregador") return "entrega";
  return "pedido";
}

function allowedStage(
  role: OperationalMatrixData["role"],
  requested?: MatrixStage,
) {
  if (role !== "administrador") return defaultStage(role);
  return requested ?? "pedido";
}

function rowKey(line: MatrixLine) {
  return `${line.productId}:${line.sourceLabel}`;
}

function stageHeaders(stage: MatrixStage) {
  if (stage === "pedido") return ["Solicitado", "Acción"];
  if (stage === "preparacion")
    return ["Solicitado", "Preparado", "Check bodega", "Observación"];
  if (stage === "entrega")
    return [
      "Solicitado",
      "Preparado",
      "Faltante",
      "Externo",
      "Entregado",
      "Check entrega",
      "Observación",
    ];
  return ["Solicitado", "Preparado", "Externo", "Entregado", "Estado"];
}

function statusTone(line: MatrixLine, stage: MatrixStage) {
  if (stage === "preparacion" && line.preparationCheck)
    return "bg-emerald-50/70";
  if (stage === "entrega" && line.deliveryCheck) return "bg-blue-50/70";
  if (
    stage === "entrega" &&
    Math.abs(line.deliveredQuantity - line.requestedQuantity) > 0.000001
  )
    return "bg-amber-50/70";
  return "bg-background";
}

type MatrixProps = {
  data: OperationalMatrixData;
  initialStage?: MatrixStage;
  initialOrderId?: string;
};

export function OperationalMatrix({
  data,
  initialStage,
  initialOrderId,
}: MatrixProps) {
  const router = useRouter();
  const [stage, setStage] = useState<MatrixStage>(() =>
    allowedStage(data.role, initialStage),
  );
  const [lines, setLines] = useState(data.lines);
  const [orders, setOrders] = useState(data.orders);
  const [message, setMessage] = useState<string | null>(null);
  const [remotePending, setRemotePending] = useState(false);
  const [conflictPending, setConflictPending] = useState(false);
  const [selectedMobileOrder, setSelectedMobileOrder] = useState(
    data.orders.some((order) => order.id === initialOrderId)
      ? initialOrderId!
      : data.orders[0]?.id ?? "",
  );
  const dirty = useRef(new Set<string>());

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "qb_orders" },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "qb_order_items" },
        onChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "qb_order_preparation_items",
        },
        onChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "qb_order_delivery_items",
        },
        onChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "qb_order_delivery_confirmations",
        },
        onChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "qb_operational_day_orders",
        },
        onChange,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [data.operationalDate, router]);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    return lines
      .filter((line) => {
        const key = rowKey(line);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          a.categoryName.localeCompare(b.categoryName, "es") ||
          a.productName.localeCompare(b.productName, "es") ||
          a.sourceLabel.localeCompare(b.sourceLabel, "es"),
      );
  }, [lines]);
  const lineMap = useMemo(
    () =>
      new Map(
        lines.map((line) => [`${rowKey(line)}:${line.orderId}`, line]),
      ),
    [lines],
  );

  const updateLine = (id: string, patch: Partial<MatrixLine>) => {
    dirty.current.add(id);
    setLines((current) =>
      current.map((line) =>
        line.orderItemId === id ? { ...line, ...patch } : line,
      ),
    );
  };

  const latestLine = (id: string) =>
    lines.find((line) => line.orderItemId === id);

  const finishSave = (
    id: string,
    result: {
      success: boolean;
      message: string;
      conflict?: boolean;
      data?: unknown;
    },
    versionField: "preparationVersion" | "deliveryVersion",
  ) => {
    if (result.success) {
      dirty.current.delete(id);
      setMessage("Guardado.");
      if (result.data && typeof result.data === "object") {
        const response = result.data as {
          row_version?: unknown;
          order_updated_at?: unknown;
        };
        const version = Number(response.row_version);
        if (Number.isInteger(version)) {
          setLines((current) =>
            current.map((line) =>
              line.orderItemId === id
                ? { ...line, [versionField]: version }
                : line,
            ),
          );
        }
        if (typeof response.order_updated_at === "string") {
          const orderId = latestLine(id)?.orderId;
          setOrders((current) =>
            current.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    updatedAt: response.order_updated_at as string,
                    status:
                      versionField === "preparationVersion"
                        ? "en_preparacion"
                        : order.status,
                  }
                : order,
            ),
          );
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

  const savePreparation = async (id: string) => {
    const line = latestLine(id);
    if (!line) return;
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

  const saveDelivery = async (id: string) => {
    const line = latestLine(id);
    if (!line) return;
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

  const correctRequest = async (line: MatrixLine) => {
    const value = Number(
      window.prompt(
        "Nueva cantidad solicitada",
        String(line.requestedQuantity),
      ),
    );
    if (!Number.isFinite(value) || value <= 0) return;
    const reason = window.prompt("Motivo de corrección") ?? "";
    const result = await correctMatrixRequestAction({
      orderItemId: line.orderItemId,
      expectedVersion: line.requestedVersion,
      requestedQuantity: value,
      reason,
      idempotencyKey: idempotencyKey("request"),
    });
    const warning =
      result.data && typeof result.data === "object"
        ? (result.data as { warning?: unknown }).warning
        : null;
    setMessage(typeof warning === "string" ? warning : result.message);
    router.refresh();
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
      expectedVersions: Object.fromEntries(
        orders.map((order) => [order.id, order.positionVersion]),
      ),
      idempotencyKey: idempotencyKey("reorder"),
    });
    setMessage(result.message);
    if (!result.success) setOrders(orders);
    router.refresh();
  };

  const actionForOrder = async (
    order: MatrixOrder,
    action: "prepare" | "confirm" | "reopen",
  ) => {
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
  const selectedOrder =
    orders.find((order) => order.id === selectedMobileOrder) ?? orders[0];
  const selectedLines = selectedOrder
    ? lines.filter((line) => line.orderId === selectedOrder.id)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex rounded-lg border bg-muted p-1"
          role="tablist"
          aria-label="Etapa operativa"
        >
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
                } else {
                  setMessage("Guarda tus cambios antes de actualizar.");
                }
              }}
            >
              <RefreshCw className="size-4" />
              {conflictPending
                ? "Descartar local y actualizar"
                : "Cambios remotos"}
            </Button>
          ) : null}
          {message ? <span className="text-muted-foreground">{message}</span> : null}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {orders.map((order, index) => {
          const orderLines = lines.filter((line) => line.orderId === order.id);
          return (
            <div
              key={order.id}
              className="flex min-w-[260px] items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {order.customerName}
                </p>
                <p className="truncate text-muted-foreground">
                  {order.reference}
                  {order.locationLabel ? ` · ${order.locationLabel}` : ""}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {orderLines.length} líneas ·{" "}
                  {orderLines.filter((line) => line.preparationCheck).length}{" "}
                  bodega ·{" "}
                  {orderLines.filter((line) => line.deliveryCheck).length}{" "}
                  entrega
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {canAdmin ? (
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Mover cliente antes"
                      onClick={() => void moveOrder(index, -1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Mover cliente después"
                      onClick={() => void moveOrder(index, 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </>
                ) : null}
                {stage === "preparacion" &&
                ["en_preparacion", "pendiente_preparacion"].includes(
                  order.status,
                ) ? (
                  <Button
                    size="sm"
                    onClick={() => void actionForOrder(order, "prepare")}
                  >
                    Finalizar
                  </Button>
                ) : null}
                {stage === "entrega" && order.status === "preparado" ? (
                  <Button
                    size="sm"
                    onClick={() => void actionForOrder(order, "confirm")}
                  >
                    Confirmar
                  </Button>
                ) : null}
                {canAdmin &&
                stage === "entrega" &&
                order.deliveryStatus === "confirmado" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void actionForOrder(order, "reopen")}
                  >
                    Reabrir
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {!orders.length ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No hay pedidos para esta fecha. Los pedidos nuevos se agregan
          automáticamente y conservan su orden.
        </div>
      ) : (
        <>
          <div
            className="hidden max-h-[68vh] overflow-auto rounded-lg border md:block"
            data-matrix-layout="desktop-table"
          >
            <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 top-0 z-40 w-11 min-w-11 border-b border-r bg-slate-100 px-2 py-2 text-center"
                  >
                    #
                  </th>
                  <th
                    rowSpan={2}
                    className="sticky left-11 top-0 z-40 w-32 min-w-32 border-b border-r bg-slate-100 px-2 py-2 text-left"
                  >
                    Categoría
                  </th>
                  <th
                    rowSpan={2}
                    className="sticky left-[172px] top-0 z-40 w-56 min-w-56 border-b border-r bg-slate-100 px-2 py-2 text-left"
                  >
                    Producto
                  </th>
                  <th
                    rowSpan={2}
                    className="sticky left-[396px] top-0 z-40 w-24 min-w-24 border-b border-r bg-slate-100 px-2 py-2 text-left"
                  >
                    Unidad
                  </th>
                  {orders.map((order) => (
                    <th
                      key={order.id}
                      colSpan={stageHeaders(stage).length}
                      className="sticky top-0 z-30 border-b border-l-2 border-r bg-slate-100 px-3 py-2 text-left"
                    >
                      <span className="block max-w-64 truncate text-sm font-semibold">
                        {order.customerName}
                      </span>
                      <span className="block max-w-64 truncate font-normal text-muted-foreground">
                        {order.reference} · {order.locationLabel}
                      </span>
                    </th>
                  ))}
                  <th
                    rowSpan={2}
                    className="sticky top-0 z-30 min-w-40 border-b border-l-2 bg-emerald-100 px-3 py-2 text-left"
                  >
                    Totales por producto
                  </th>
                </tr>
                <tr>
                  {orders.flatMap((order) =>
                    stageHeaders(stage).map((header, index) => (
                      <th
                        key={`${order.id}:${header}`}
                        className={`sticky top-[53px] z-30 min-w-20 border-b border-r bg-slate-50 px-2 py-1.5 text-center font-medium ${
                          index === 0 ? "border-l-2" : ""
                        } ${header === "Observación" ? "min-w-40" : ""}`}
                      >
                        {header}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const rowLines = lines.filter(
                    (line) => rowKey(line) === rowKey(row),
                  );
                  return (
                    <tr key={rowKey(row)} className="hover:bg-muted/20">
                      <td className="sticky left-0 z-20 border-b border-r bg-background px-2 py-1.5 text-center text-muted-foreground">
                        {index + 1}
                      </td>
                      <td className="sticky left-11 z-20 max-w-32 border-b border-r bg-background px-2 py-1.5">
                        <span className="line-clamp-2">
                          {row.categoryName}
                        </span>
                      </td>
                      <td className="sticky left-[172px] z-20 max-w-56 border-b border-r bg-background px-2 py-1.5 font-medium">
                        {row.productName}
                      </td>
                      <td className="sticky left-[396px] z-20 border-b border-r bg-background px-2 py-1.5">
                        <span className="block">{row.sourceLabel}</span>
                        <span className="text-[10px] text-muted-foreground">
                          Base {row.baseUnitSymbol}
                        </span>
                      </td>
                      {orders.map((order) => {
                        const line = lineMap.get(
                          `${rowKey(row)}:${order.id}`,
                        );
                        return line ? (
                          <DesktopOrderCells
                            key={order.id}
                            line={line}
                            stage={stage}
                            canAdmin={canAdmin}
                            onChange={(patch) =>
                              updateLine(line.orderItemId, patch)
                            }
                            onSavePreparation={() =>
                              void savePreparation(line.orderItemId)
                            }
                            onSaveDelivery={() =>
                              void saveDelivery(line.orderItemId)
                            }
                            onCorrect={() => void correctRequest(line)}
                          />
                        ) : (
                          <td
                            key={order.id}
                            colSpan={stageHeaders(stage).length}
                            className="border-b border-l-2 border-r px-2 py-1.5 text-center text-muted-foreground"
                          >
                            —
                          </td>
                        );
                      })}
                      <RowTotals lines={rowLines} stage={stage} />
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th
                    colSpan={4}
                    className="sticky bottom-0 left-0 z-30 border-t bg-slate-100 px-3 py-2 text-left"
                  >
                    Totales por cliente
                  </th>
                  {orders.map((order) => {
                    const orderLines = lines.filter(
                      (line) => line.orderId === order.id,
                    );
                    const completed =
                      stage === "entrega"
                        ? orderLines.filter((line) => line.deliveryCheck).length
                        : orderLines.filter((line) => line.preparationCheck)
                            .length;
                    return (
                      <th
                        key={order.id}
                        colSpan={stageHeaders(stage).length}
                        className="sticky bottom-0 z-20 border-l-2 border-t border-r bg-slate-100 px-3 py-2 text-left"
                      >
                        {orderLines.length} líneas · {completed} checks
                      </th>
                    );
                  })}
                  <th className="sticky bottom-0 z-20 border-l-2 border-t bg-emerald-100 px-3 py-2">
                    {lines.length} líneas
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="space-y-3 md:hidden" data-matrix-layout="mobile-table">
            <label className="block text-sm font-medium">
              Cliente
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                value={selectedOrder?.id ?? ""}
                onChange={(event) =>
                  setSelectedMobileOrder(event.target.value)
                }
              >
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.customerName} · {order.reference}
                  </option>
                ))}
              </select>
            </label>
            {selectedOrder ? (
              <section className="overflow-hidden rounded-lg border">
                <header className="sticky top-0 z-30 border-b bg-slate-100 px-3 py-2">
                  <p className="font-semibold">{selectedOrder.customerName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedOrder.reference} · {selectedOrder.locationLabel}
                  </p>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-max min-w-full border-separate border-spacing-0 text-[11px]">
                    <MobileHeader stage={stage} />
                    <tbody>
                      {selectedLines.map((line, index) => (
                        <MobileRow
                          key={line.orderItemId}
                          index={index}
                          line={line}
                          stage={stage}
                          canAdmin={canAdmin}
                          onChange={(patch) =>
                            updateLine(line.orderItemId, patch)
                          }
                          onSavePreparation={() =>
                            void savePreparation(line.orderItemId)
                          }
                          onSaveDelivery={() =>
                            void saveDelivery(line.orderItemId)
                          }
                          onCorrect={() => void correctRequest(line)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

type CellProps = {
  line: MatrixLine;
  stage: MatrixStage;
  canAdmin: boolean;
  onChange: (patch: Partial<MatrixLine>) => void;
  onSavePreparation: () => void;
  onSaveDelivery: () => void;
  onCorrect: () => void;
};

function NumberEditor({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onBlur: () => void;
}) {
  return (
    <Input
      aria-label={label}
      className="h-7 min-w-20 px-2 text-right text-xs"
      type="number"
      min={0}
      step="0.001"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      onBlur={onBlur}
    />
  );
}

function CheckEditor({
  label,
  checked,
  onChange,
  onBlur,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onBlur: () => void;
}) {
  return (
    <label className="flex justify-center">
      <input
        aria-label={label}
        className="size-4 accent-emerald-700"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        onBlur={onBlur}
      />
    </label>
  );
}

function NoteEditor({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <Input
      aria-label={label}
      className="h-7 min-w-36 px-2 text-xs"
      value={value}
      placeholder="Nota"
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  );
}

function DesktopOrderCells(props: CellProps) {
  const {
    line,
    stage,
    canAdmin,
    onChange,
    onSavePreparation,
    onSaveDelivery,
    onCorrect,
  } = props;
  const missing = Math.max(0, line.requestedQuantity - line.preparedQuantity);
  const tone = statusTone(line, stage);
  const cellClass = `border-b border-r px-2 py-1.5 text-center ${tone}`;

  if (stage === "pedido") {
    return (
      <>
        <td className={`${cellClass} border-l-2 font-semibold`}>
          {formatQuantity(line.requestedQuantity)}
        </td>
        <td className={cellClass}>
          {canAdmin ? (
            <Button
              size="xs"
              variant="outline"
              type="button"
              onClick={onCorrect}
            >
              Editar
            </Button>
          ) : (
            "—"
          )}
        </td>
      </>
    );
  }
  if (stage === "preparacion") {
    return (
      <>
        <td className={`${cellClass} border-l-2`}>
          {formatQuantity(line.requestedQuantity)}
        </td>
        <td className={cellClass}>
          <NumberEditor
            label={`Preparado ${line.productName}`}
            value={line.preparedQuantity}
            onChange={(value) => onChange({ preparedQuantity: value })}
            onBlur={onSavePreparation}
          />
        </td>
        <td className={cellClass}>
          <CheckEditor
            label={`Check bodega ${line.productName}`}
            checked={line.preparationCheck}
            onChange={(checked) => onChange({ preparationCheck: checked })}
            onBlur={onSavePreparation}
          />
        </td>
        <td className={cellClass}>
          <NoteEditor
            label={`Observación bodega ${line.productName}`}
            value={line.preparationNote}
            onChange={(value) => onChange({ preparationNote: value })}
            onBlur={onSavePreparation}
          />
        </td>
      </>
    );
  }
  if (stage === "entrega") {
    return (
      <>
        <td className={`${cellClass} border-l-2`}>
          {formatQuantity(line.requestedQuantity)}
        </td>
        <td className={cellClass}>
          {formatQuantity(line.preparedQuantity)}
        </td>
        <td className={`${cellClass} ${missing ? "text-amber-700" : ""}`}>
          {formatQuantity(missing)}
        </td>
        <td className={cellClass}>
          <NumberEditor
            label={`Externo ${line.productName}`}
            value={line.externalQuantity}
            onChange={(value) => onChange({ externalQuantity: value })}
            onBlur={onSaveDelivery}
          />
        </td>
        <td className={cellClass}>
          <NumberEditor
            label={`Entregado ${line.productName}`}
            value={line.deliveredQuantity}
            onChange={(value) => onChange({ deliveredQuantity: value })}
            onBlur={onSaveDelivery}
          />
        </td>
        <td className={cellClass}>
          <CheckEditor
            label={`Check entrega ${line.productName}`}
            checked={line.deliveryCheck}
            onChange={(checked) => onChange({ deliveryCheck: checked })}
            onBlur={onSaveDelivery}
          />
        </td>
        <td className={cellClass}>
          <NoteEditor
            label={`Observación entrega ${line.productName}`}
            value={line.deliveryNote}
            onChange={(value) => onChange({ deliveryNote: value })}
            onBlur={onSaveDelivery}
          />
        </td>
      </>
    );
  }
  const differs =
    Math.abs(line.requestedQuantity - line.deliveredQuantity) > 0.000001;
  return (
    <>
      <td className={`${cellClass} border-l-2`}>
        {formatQuantity(line.requestedQuantity)}
      </td>
      <td className={cellClass}>{formatQuantity(line.preparedQuantity)}</td>
      <td className={cellClass}>{formatQuantity(line.externalQuantity)}</td>
      <td className={cellClass}>{formatQuantity(line.deliveredQuantity)}</td>
      <td
        className={`${cellClass} ${differs ? "text-amber-700" : "text-emerald-700"}`}
      >
        <span className="inline-flex items-center gap-1">
          {differs ? (
            <AlertTriangle className="size-3" />
          ) : (
            <Check className="size-3" />
          )}
          {differs ? "Diferencia" : "Completo"}
        </span>
      </td>
    </>
  );
}

function RowTotals({
  lines,
  stage,
}: {
  lines: MatrixLine[];
  stage: MatrixStage;
}) {
  const total = (
    field:
      | "requestedQuantity"
      | "preparedQuantity"
      | "externalQuantity"
      | "deliveredQuantity",
  ) => lines.reduce((sum, line) => sum + line[field], 0);
  return (
    <td className="border-b border-l-2 bg-emerald-50 px-3 py-1.5 align-top text-[11px]">
      <p>Solicitado: {formatQuantity(total("requestedQuantity"))}</p>
      {stage !== "pedido" ? (
        <p>Preparado: {formatQuantity(total("preparedQuantity"))}</p>
      ) : null}
      {stage === "entrega" || stage === "resumen" ? (
        <>
          <p>Externo: {formatQuantity(total("externalQuantity"))}</p>
          <p>Entregado: {formatQuantity(total("deliveredQuantity"))}</p>
        </>
      ) : null}
    </td>
  );
}

function MobileHeader({ stage }: { stage: MatrixStage }) {
  const headers =
    stage === "preparacion"
      ? ["Producto", "Solicitado", "Preparado", "Check", "Faltante", "Nota"]
      : stage === "entrega"
        ? [
            "Producto",
            "Preparado",
            "Externo",
            "Entregado",
            "Check",
            "Nota",
          ]
        : stage === "pedido"
          ? ["Producto", "Solicitado", "Acción"]
          : [
              "Producto",
              "Solicitado",
              "Preparado",
              "Externo",
              "Entregado",
              "Estado",
            ];
  return (
    <thead>
      <tr>
        {headers.map((header, index) => (
          <th
            key={header}
            className={`sticky top-0 z-20 border-b border-r bg-slate-50 px-2 py-2 text-left ${
              index === 0 ? "left-0 z-30 min-w-40" : "min-w-20"
            }`}
          >
            {header}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function MobileRow(props: CellProps & { index: number }) {
  const {
    line,
    stage,
    canAdmin,
    index,
    onChange,
    onSavePreparation,
    onSaveDelivery,
    onCorrect,
  } = props;
  const missing = Math.max(0, line.requestedQuantity - line.preparedQuantity);
  const productCell = (
    <td className="sticky left-0 z-10 max-w-40 border-b border-r bg-background px-2 py-2 align-top">
      <span className="font-medium">
        {index + 1}. {line.productName}
      </span>
      <span className="block text-[10px] text-muted-foreground">
        {line.sourceLabel}
      </span>
    </td>
  );
  const cell = "border-b border-r px-2 py-2 text-center align-middle";

  if (stage === "preparacion") {
    return (
      <tr className={statusTone(line, stage)}>
        {productCell}
        <td className={cell}>{formatQuantity(line.requestedQuantity)}</td>
        <td className={cell}>
          <NumberEditor
            label={`Preparado ${line.productName}`}
            value={line.preparedQuantity}
            onChange={(value) => onChange({ preparedQuantity: value })}
            onBlur={onSavePreparation}
          />
        </td>
        <td className={cell}>
          <CheckEditor
            label={`Check bodega ${line.productName}`}
            checked={line.preparationCheck}
            onChange={(checked) => onChange({ preparationCheck: checked })}
            onBlur={onSavePreparation}
          />
        </td>
        <td className={cell}>{formatQuantity(missing)}</td>
        <td className={cell}>
          <details className="text-left">
            <summary className="cursor-pointer text-emerald-800">Nota</summary>
            <NoteEditor
              label={`Nota bodega ${line.productName}`}
              value={line.preparationNote}
              onChange={(value) => onChange({ preparationNote: value })}
              onBlur={onSavePreparation}
            />
          </details>
        </td>
      </tr>
    );
  }
  if (stage === "entrega") {
    return (
      <tr className={statusTone(line, stage)}>
        {productCell}
        <td className={cell}>{formatQuantity(line.preparedQuantity)}</td>
        <td className={cell}>
          <NumberEditor
            label={`Externo ${line.productName}`}
            value={line.externalQuantity}
            onChange={(value) => onChange({ externalQuantity: value })}
            onBlur={onSaveDelivery}
          />
        </td>
        <td className={cell}>
          <NumberEditor
            label={`Entregado ${line.productName}`}
            value={line.deliveredQuantity}
            onChange={(value) => onChange({ deliveredQuantity: value })}
            onBlur={onSaveDelivery}
          />
        </td>
        <td className={cell}>
          <CheckEditor
            label={`Check entrega ${line.productName}`}
            checked={line.deliveryCheck}
            onChange={(checked) => onChange({ deliveryCheck: checked })}
            onBlur={onSaveDelivery}
          />
        </td>
        <td className={cell}>
          <details className="text-left">
            <summary className="cursor-pointer text-blue-800">Nota</summary>
            <NoteEditor
              label={`Nota entrega ${line.productName}`}
              value={line.deliveryNote}
              onChange={(value) => onChange({ deliveryNote: value })}
              onBlur={onSaveDelivery}
            />
          </details>
        </td>
      </tr>
    );
  }
  if (stage === "pedido") {
    return (
      <tr>
        {productCell}
        <td className={cell}>{formatQuantity(line.requestedQuantity)}</td>
        <td className={cell}>
          {canAdmin ? (
            <Button size="xs" variant="outline" onClick={onCorrect}>
              Editar
            </Button>
          ) : (
            "—"
          )}
        </td>
      </tr>
    );
  }
  const differs =
    Math.abs(line.requestedQuantity - line.deliveredQuantity) > 0.000001;
  return (
    <tr>
      {productCell}
      <td className={cell}>{formatQuantity(line.requestedQuantity)}</td>
      <td className={cell}>{formatQuantity(line.preparedQuantity)}</td>
      <td className={cell}>{formatQuantity(line.externalQuantity)}</td>
      <td className={cell}>{formatQuantity(line.deliveredQuantity)}</td>
      <td className={`${cell} ${differs ? "text-amber-700" : "text-emerald-700"}`}>
        {differs ? "Diferencia" : "Completo"}
      </td>
    </tr>
  );
}
