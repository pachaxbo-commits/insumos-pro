"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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

function stageHeaders() {
  return ["CANT", "CHECK", "PESO REAL", "OBSERVACIÓN"];
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
  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const focusedOrderId = data.orders.some(
    (order) => order.id === initialOrderId,
  )
    ? initialOrderId
    : undefined;
  const dirty = useRef(new Set<string>());

  useEffect(() => {
    if (!focusedOrderId) return;
    const target = matrixScrollRef.current?.querySelector<HTMLElement>(
      `[data-order-group="${focusedOrderId}"]`,
    );
    target?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [focusedOrderId]);

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
      actualWeightKg: line.controlsActualWeight
        ? line.preparationActualWeightKg
        : null,
      note: line.preparationNote,
      idempotencyKey: idempotencyKey("prep"),
    });
    finishSave(line.orderItemId, result, "preparationVersion");
  };

  const saveDelivery = async (id: string) => {
    const line = latestLine(id);
    if (!line) return;
    const externalQuantity = Math.max(
      line.deliveredQuantity - line.preparedQuantity,
      0,
    );
    if (externalQuantity !== line.externalQuantity) {
      setLines((current) =>
        current.map((currentLine) =>
          currentLine.orderItemId === id
            ? { ...currentLine, externalQuantity }
            : currentLine,
        ),
      );
    }
    const result = await saveMatrixDeliveryAction({
      orderItemId: line.orderItemId,
      expectedVersion: line.deliveryVersion,
      externalQuantity,
      deliveredQuantity: line.deliveredQuantity,
      deliveryCheck: line.deliveryCheck,
      actualWeightKg: line.controlsActualWeight
        ? line.deliveryActualWeightKg
        : null,
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
  const headers = stageHeaders();
  const matrixColumnCount = 3 + orders.length * headers.length + 1;
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

      {!orders.length ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No hay pedidos para esta fecha. Los pedidos nuevos se agregan
          automáticamente y conservan su orden.
        </div>
      ) : (
        <div
          ref={matrixScrollRef}
          className="max-h-[68vh] touch-pan-x touch-pan-y overflow-auto overscroll-contain rounded-lg border"
          data-matrix-layout="continuous-sheet"
          aria-label={`Matriz continua de todos los clientes para ${data.operationalDate}`}
        >
          <table className="w-max min-w-full border-separate border-spacing-0 text-[10px] sm:text-xs">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 top-0 z-50 w-9 min-w-9 border-b border-r bg-slate-100 px-1 py-2 text-center"
                >
                  N°
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-9 top-0 z-50 w-40 min-w-40 border-b border-r bg-slate-100 px-2 py-2 text-left md:w-56 md:min-w-56"
                >
                  DESCRIPCIÓN
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-[196px] top-0 z-50 w-[72px] min-w-[72px] border-b border-r bg-slate-100 px-2 py-2 text-left md:left-[260px]"
                >
                  UD
                </th>
                {orders.map((order, orderIndex) => {
                  const focused = order.id === focusedOrderId;
                  return (
                    <th
                      key={order.id}
                      data-order-group={order.id}
                      colSpan={headers.length}
                      className={`sticky top-0 z-40 h-[74px] border-b border-l-2 border-r px-2 py-1.5 text-left ${
                        focused
                          ? "border-sky-500 bg-sky-100 ring-2 ring-inset ring-sky-500"
                          : "bg-slate-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block max-w-64 truncate text-xs font-semibold sm:text-sm">
                            {order.customerName}
                          </span>
                          <span className="block max-w-64 truncate font-normal text-muted-foreground">
                            {order.reference} · {order.locationLabel}
                          </span>
                        </span>
                        <span className="flex shrink-0 gap-0.5">
                          {canAdmin ? (
                            <>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label="Mover cliente antes"
                                onClick={() => void moveOrder(orderIndex, -1)}
                              >
                                <ChevronLeft />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label="Mover cliente después"
                                onClick={() => void moveOrder(orderIndex, 1)}
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
                              size="xs"
                              onClick={() =>
                                void actionForOrder(order, "prepare")
                              }
                            >
                              Finalizar
                            </Button>
                          ) : null}
                          {stage === "entrega" &&
                          order.status === "preparado" ? (
                            <Button
                              size="xs"
                              onClick={() =>
                                void actionForOrder(order, "confirm")
                              }
                            >
                              Confirmar
                            </Button>
                          ) : null}
                          {order.deliveryStatus === "confirmado" ? (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                void actionForOrder(order, "reopen")
                              }
                            >
                              Reabrir
                            </Button>
                          ) : null}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th
                  rowSpan={2}
                  className="sticky top-0 z-40 min-w-40 border-b border-l-2 bg-emerald-100 px-3 py-2 text-left"
                >
                  TOTALES
                </th>
              </tr>
              <tr>
                {orders.flatMap((order) =>
                  headers.map((header, index) => (
                    <th
                      key={`${order.id}:${header}`}
                      className={`sticky top-[74px] z-40 min-w-[68px] border-b border-r px-1.5 py-1.5 text-center font-semibold ${
                        index === 0 ? "border-l-2" : ""
                      } ${
                        order.id === focusedOrderId
                          ? "border-sky-400 bg-sky-50"
                          : "bg-slate-50"
                      } ${
                        header === "OBSERVACIÓN"
                          ? "min-w-36"
                          : header === "PESO REAL"
                            ? "min-w-24"
                            : ""
                      }`}
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
                const categoryStarts =
                  index === 0 ||
                  rows[index - 1]?.categoryName !== row.categoryName;
                return (
                  <Fragment key={rowKey(row)}>
                    {categoryStarts ? (
                      <tr data-category-row={row.categoryName}>
                        <td
                          colSpan={matrixColumnCount}
                          className="border-b border-t bg-slate-200 px-2 py-1.5 text-left font-bold uppercase tracking-wide text-slate-700"
                        >
                          {row.categoryName}
                        </td>
                      </tr>
                    ) : null}
                    <tr data-product-color={row.productColor ?? "#FFFFFF"}>
                      <td
                        style={{ backgroundColor: row.productColor ?? "#FFFFFF" }}
                        className="sticky left-0 z-30 border-b border-r px-1 py-1.5 text-center text-muted-foreground"
                      >
                        {index + 1}
                      </td>
                      <td
                        style={{ backgroundColor: row.productColor ?? "#FFFFFF" }}
                        className="sticky left-9 z-30 max-w-40 border-b border-r px-2 py-1.5 font-medium md:max-w-56"
                      >
                        {row.productName}
                      </td>
                      <td
                        style={{ backgroundColor: row.productColor ?? "#FFFFFF" }}
                        className="sticky left-[196px] z-30 border-b border-r px-1.5 py-1.5 md:left-[260px]"
                      >
                        <span className="block uppercase">{row.sourceLabel}</span>
                        <span className="text-[9px] text-muted-foreground">
                          {row.baseUnitSymbol}
                        </span>
                      </td>
                      {orders.map((order) => {
                        const line = lineMap.get(
                          `${rowKey(row)}:${order.id}`,
                        );
                        const focused = order.id === focusedOrderId;
                        return line ? (
                          <DesktopOrderCells
                            key={order.id}
                            line={line}
                            stage={stage}
                            canAdmin={canAdmin}
                            focused={focused}
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
                            colSpan={headers.length}
                            style={{
                              backgroundColor: row.productColor ?? "#FFFFFF",
                            }}
                            className={`border-b border-l-2 border-r px-2 py-1.5 text-center text-muted-foreground ${
                              focused ? "ring-1 ring-inset ring-sky-400" : ""
                            }`}
                          >
                            —
                          </td>
                        );
                      })}
                      <RowTotals
                        lines={rowLines}
                        stage={stage}
                        productColor={row.productColor}
                      />
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th
                  colSpan={3}
                  className="sticky bottom-0 left-0 z-40 border-t bg-slate-100 px-3 py-2 text-left"
                >
                  TOTALES POR CLIENTE
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
                      colSpan={headers.length}
                      className={`sticky bottom-0 z-30 border-l-2 border-t border-r px-3 py-2 text-left ${
                        order.id === focusedOrderId
                          ? "bg-sky-100"
                          : "bg-slate-100"
                      }`}
                    >
                      {orderLines.length} líneas · {completed} checks
                    </th>
                  );
                })}
                <th className="sticky bottom-0 z-30 border-l-2 border-t bg-emerald-100 px-3 py-2">
                  {lines.length} líneas
                </th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

type CellProps = {
  line: MatrixLine;
  stage: MatrixStage;
  canAdmin: boolean;
  focused: boolean;
  onChange: (patch: Partial<MatrixLine>) => void;
  onSavePreparation: () => void;
  onSaveDelivery: () => void;
  onCorrect: () => void;
};

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

function WeightEditor({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur: () => void;
}) {
  return (
    <div className="relative min-w-24">
      <Input
        aria-label={label}
        className="h-7 min-w-24 pr-7 text-right text-xs"
        type="number"
        min={0}
        step="0.5"
        value={value ?? ""}
        placeholder="0"
        onChange={(event) =>
          onChange(
            event.target.value === "" ? null : Number(event.target.value),
          )
        }
        onBlur={onBlur}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">
        kg
      </span>
    </div>
  );
}

function DesktopOrderCells(props: CellProps) {
  const {
    line,
    stage,
    canAdmin,
    focused,
    onChange,
    onSavePreparation,
    onSaveDelivery,
    onCorrect,
  } = props;
  const cellStyle = {
    backgroundColor: line.productColor ?? "#FFFFFF",
  };
  const cellClass = `border-b border-r px-2 py-1.5 text-center ${
    focused ? "ring-1 ring-inset ring-sky-400" : ""
  }`;

  if (stage === "pedido") {
    return (
      <>
        <td style={cellStyle} className={`${cellClass} border-l-2 font-semibold`}>
          {formatQuantity(line.requestedQuantity)}
        </td>
        <td style={cellStyle} className={cellClass}>
          <span className="text-muted-foreground">—</span>
        </td>
        <td style={cellStyle} className={cellClass}>
          <span className="text-muted-foreground">—</span>
        </td>
        <td style={cellStyle} className={cellClass}>
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
        <td style={cellStyle} className={`${cellClass} border-l-2`}>
          <span className="font-semibold">
            {formatQuantity(line.requestedQuantity)}
          </span>
        </td>
        <td style={cellStyle} className={cellClass}>
          <CheckEditor
            label={`Check bodega ${line.productName}`}
            checked={line.preparationCheck}
            onChange={(checked) =>
              onChange({
                preparationCheck: checked,
                preparedQuantity: checked ? line.requestedQuantity : 0,
              })
            }
            onBlur={onSavePreparation}
          />
        </td>
        <td style={cellStyle} className={cellClass}>
          {line.controlsActualWeight ? (
            <WeightEditor
              label={`Peso real bodega ${line.productName}`}
              value={line.preparationActualWeightKg}
              onChange={(value) =>
                onChange({ preparationActualWeightKg: value })
              }
              onBlur={onSavePreparation}
            />
          ) : (
            <span
              className="text-muted-foreground"
              title="Este producto se controla solo por cantidad o unidad"
            >
              —
            </span>
          )}
        </td>
        <td style={cellStyle} className={cellClass}>
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
        <td style={cellStyle} className={`${cellClass} border-l-2`}>
          <span className="font-semibold">
            {formatQuantity(line.requestedQuantity)}
          </span>
        </td>
        <td style={cellStyle} className={cellClass}>
          <CheckEditor
            label={`Check entrega ${line.productName}`}
            checked={line.deliveryCheck}
            onChange={(checked) =>
              onChange({
                deliveryCheck: checked,
                deliveredQuantity: checked ? line.requestedQuantity : 0,
              })
            }
            onBlur={onSaveDelivery}
          />
        </td>
        <td style={cellStyle} className={cellClass}>
          {line.controlsActualWeight ? (
            <WeightEditor
              label={`Peso real entrega ${line.productName}`}
              value={line.deliveryActualWeightKg}
              onChange={(value) => onChange({ deliveryActualWeightKg: value })}
              onBlur={onSaveDelivery}
            />
          ) : (
            <span
              className="text-muted-foreground"
              title="Este producto se controla solo por cantidad o unidad"
            >
              —
            </span>
          )}
        </td>
        <td style={cellStyle} className={cellClass}>
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
      <td style={cellStyle} className={`${cellClass} border-l-2`}>
        {formatQuantity(line.requestedQuantity)}
      </td>
      <td
        style={cellStyle}
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
      <td style={cellStyle} className={cellClass}>
        {line.controlsActualWeight
          ? (line.deliveryActualWeightKg ??
            line.preparationActualWeightKg ??
            "—")
          : "—"}
        {line.controlsActualWeight &&
        (line.deliveryActualWeightKg !== null ||
          line.preparationActualWeightKg !== null)
          ? " kg"
          : ""}
      </td>
      <td style={cellStyle} className={`${cellClass} min-w-36 text-left`}>
        {line.deliveryNote || line.preparationNote || "—"}
      </td>
    </>
  );
}

function RowTotals({
  lines,
  stage,
  productColor,
}: {
  lines: MatrixLine[];
  stage: MatrixStage;
  productColor: string | null;
}) {
  const total = (
    field:
      | "requestedQuantity"
      | "preparedQuantity"
      | "externalQuantity"
      | "deliveredQuantity",
  ) => lines.reduce((sum, line) => sum + line[field], 0);
  return (
    <td
      style={{ backgroundColor: productColor ?? "#FFFFFF" }}
      className="border-b border-l-2 px-3 py-1.5 align-top text-[11px]"
    >
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
