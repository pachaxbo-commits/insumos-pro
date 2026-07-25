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

function groupDomId(value: string) {
  return encodeURIComponent(value);
}

function stageHeaders(stage: MatrixStage) {
  if (stage === "preparacion") {
    return ["CANT", "CHECK", "OBSERVACIÓN"];
  }
  if (stage === "entrega") {
    return ["CANT", "CHECK INV.", "PESO/CANT. REAL", "OBSERVACIÓN"];
  }
  return ["CANT", "CHECK", "PESO REAL", "OBSERVACIÓN"];
}

function groupStatus(group: MatrixCustomerGroup) {
  if (group.orders.every((order) => order.status === "cancelado")) {
    return "Cancelado";
  }
  if (group.orders.every((order) => order.deliveryStatus === "confirmado")) {
    return "Entrega confirmada";
  }
  if (group.orders.every((order) => order.status === "preparado")) {
    return "Listo para entregar";
  }
  if (group.orders.some((order) => order.status === "en_preparacion")) {
    return "En preparación";
  }
  return "Pendiente de preparación";
}

function stageGuidance(stage: MatrixStage) {
  if (stage === "preparacion") {
    return {
      title: "Confirmación de Inventario",
      detail:
        "Marca CHECK sin observación si está todo completo. Si hay una cantidad parcial, marca CHECK y explica la diferencia. Si no hay producto, deja el check vacío. No necesitas finalizar la preparación.",
    };
  }
  if (stage === "entrega") {
    return {
      title: "Confirmación del Entregador",
      detail:
        "El check de Inventario queda como referencia. Sus cantidades completas se copian como valor inicial, pero Entrega puede corregir cualquier peso, cantidad u observación para registrar exactamente lo que recibió el cliente.",
    };
  }
  if (stage === "resumen") {
    return {
      title: "Resumen operativo",
      detail:
        "Vista de solo lectura para comparar solicitado, preparado y entregado.",
    };
  }
  return {
    title: "Pedido del cliente",
    detail:
      "CANT. muestra automáticamente lo solicitado por el cliente. Administración puede corregir una cantidad dejando motivo en la bitácora.",
  };
}

type MatrixProps = {
  data: OperationalMatrixData;
  initialStage?: MatrixStage;
  initialOrderId?: string;
};

type MatrixCustomerGroup = {
  id: string;
  customerName: string;
  locationLabel: string;
  references: string;
  orders: MatrixOrder[];
};

function uniqueText(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sumLines(
  lines: MatrixLine[],
  field:
    | "requestedQuantity"
    | "preparedQuantity"
    | "preparedBaseQuantity"
    | "externalQuantity"
    | "deliveredQuantity"
    | "deliveredBaseQuantity",
) {
  return lines.reduce((total, line) => total + line[field], 0);
}

function sumNullable(
  lines: MatrixLine[],
  field: "preparationActualWeightKg" | "deliveryActualWeightKg",
) {
  const values = lines
    .map((line) => line[field])
    .filter((value): value is number => value !== null);
  return values.length
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

function aggregateLines(lines: MatrixLine[]): MatrixLine {
  const first = lines[0];
  return {
    ...first,
    requestedQuantity: sumLines(lines, "requestedQuantity"),
    preparedQuantity: sumLines(lines, "preparedQuantity"),
    preparedBaseQuantity: sumLines(lines, "preparedBaseQuantity"),
    preparationCheck: lines.every((line) => line.preparationCheck),
    preparationActualWeightKg: sumNullable(lines, "preparationActualWeightKg"),
    preparationNote: uniqueText(lines.map((line) => line.preparationNote)).join(
      " | ",
    ),
    preparedAt: lines.every((line) => line.preparedAt)
      ? first.preparedAt
      : null,
    externalQuantity: sumLines(lines, "externalQuantity"),
    deliveredQuantity: sumLines(lines, "deliveredQuantity"),
    deliveredBaseQuantity: sumLines(lines, "deliveredBaseQuantity"),
    deliveryCheck: lines.every((line) => line.deliveryCheck),
    deliveryActualWeightKg: sumNullable(lines, "deliveryActualWeightKg"),
    deliveryNote: uniqueText(lines.map((line) => line.deliveryNote)).join(
      " | ",
    ),
  };
}

function distributeValue(lines: MatrixLine[], total: number) {
  const requestedTotal = sumLines(lines, "requestedQuantity");
  let assigned = 0;
  return lines.map((line, index) => {
    if (index === lines.length - 1) {
      return Math.max(Number((total - assigned).toFixed(6)), 0);
    }
    const value =
      requestedTotal > 0
        ? Number(((total * line.requestedQuantity) / requestedTotal).toFixed(6))
        : Number((total / lines.length).toFixed(6));
    assigned += value;
    return value;
  });
}

function hasCompletePreparation(line: MatrixLine) {
  return Boolean(
    line.preparedAt && line.preparationCheck && !line.preparationNote.trim(),
  );
}

function applyAutomaticDeliveryValues(lines: MatrixLine[]) {
  return lines.map((line) =>
    hasCompletePreparation(line) &&
    !line.deliveredAt &&
    line.deliveryVersion === 0
      ? {
          ...line,
          deliveredQuantity: line.preparedQuantity,
          deliveryCheck: true,
          deliveryActualWeightKg: line.controlsActualWeight
            ? line.preparedQuantity
            : null,
        }
      : line,
  );
}

function mergeServerLines(
  serverLines: MatrixLine[],
  currentLines: MatrixLine[],
) {
  const currentById = new Map(
    currentLines.map((line) => [line.orderItemId, line]),
  );
  const merged = serverLines.map((serverLine) => {
    const current = currentById.get(serverLine.orderItemId);
    if (!current) return serverLine;
    let next = serverLine;

    if (current.requestedVersion > serverLine.requestedVersion) {
      next = {
        ...next,
        requestedQuantity: current.requestedQuantity,
        requestedVersion: current.requestedVersion,
      };
    }
    if (current.preparationVersion > serverLine.preparationVersion) {
      next = {
        ...next,
        preparedQuantity: current.preparedQuantity,
        preparedBaseQuantity: current.preparedBaseQuantity,
        preparationCheck: current.preparationCheck,
        preparationActualWeightKg: current.preparationActualWeightKg,
        preparationNote: current.preparationNote,
        preparationVersion: current.preparationVersion,
        preparedBy: current.preparedBy,
        preparedAt: current.preparedAt,
      };
    }
    if (current.deliveryVersion > serverLine.deliveryVersion) {
      next = {
        ...next,
        externalQuantity: current.externalQuantity,
        deliveredQuantity: current.deliveredQuantity,
        deliveredBaseQuantity: current.deliveredBaseQuantity,
        deliveryCheck: current.deliveryCheck,
        deliveryActualWeightKg: current.deliveryActualWeightKg,
        deliveryNote: current.deliveryNote,
        deliveryVersion: current.deliveryVersion,
        deliveredBy: current.deliveredBy,
        deliveredAt: current.deliveredAt,
      };
    }
    return next;
  });
  return applyAutomaticDeliveryValues(merged);
}

export function OperationalMatrix({
  data,
  initialStage,
  initialOrderId,
}: MatrixProps) {
  const router = useRouter();
  const [stage, setStage] = useState<MatrixStage>(() =>
    allowedStage(data.role, initialStage),
  );
  const [lines, setLines] = useState(() =>
    applyAutomaticDeliveryValues(data.lines),
  );
  const linesRef = useRef(lines);
  const [orders, setOrders] = useState(data.orders);
  const ordersRef = useRef(orders);
  const [message, setMessage] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [remotePending, setRemotePending] = useState(false);
  const [conflictPending, setConflictPending] = useState(false);
  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(new Set<string>());
  const preparationSaveQueues = useRef(new Map<string, Promise<void>>());
  const deliverySaveQueues = useRef(new Map<string, Promise<void>>());
  const customerGroups = useMemo(() => {
    const groups = new Map<string, MatrixCustomerGroup>();
    for (const order of orders) {
      const current = groups.get(order.customerKey);
      if (current) {
        current.orders.push(order);
        current.references = uniqueText(
          current.orders.map((item) => item.reference),
        ).join(", ");
        current.locationLabel = uniqueText(
          current.orders
            .map((item) => item.locationLabel ?? "")
            .filter(Boolean),
        ).join(", ");
        continue;
      }
      groups.set(order.customerKey, {
        id: order.customerKey,
        customerName: order.customerName,
        locationLabel: order.locationLabel ?? "",
        references: order.reference,
        orders: [order],
      });
    }
    return [...groups.values()].sort(
      (left, right) =>
        Math.min(...left.orders.map((order) => order.position)) -
        Math.min(...right.orders.map((order) => order.position)),
    );
  }, [orders]);
  const groupByOrderId = useMemo(
    () =>
      new Map(
        customerGroups.flatMap((group) =>
          group.orders.map((order) => [order.id, group] as const),
        ),
      ),
    [customerGroups],
  );
  const focusedCustomerId = initialOrderId
    ? groupByOrderId.get(initialOrderId)?.id
    : undefined;

  useEffect(() => {
    if (dirty.current.size) {
      setRemotePending(true);
      return;
    }
    const scrollLeft = matrixScrollRef.current?.scrollLeft ?? 0;
    const scrollTop = matrixScrollRef.current?.scrollTop ?? 0;
    const refreshedLines = mergeServerLines(data.lines, linesRef.current);
    linesRef.current = refreshedLines;
    setLines(refreshedLines);
    ordersRef.current = data.orders;
    setOrders(data.orders);
    const frame = requestAnimationFrame(() => {
      matrixScrollRef.current?.scrollTo({
        left: scrollLeft,
        top: scrollTop,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [data.lines, data.orders]);

  useEffect(() => {
    if (!focusedCustomerId) return;
    const target = matrixScrollRef.current?.querySelector<HTMLElement>(
      `[data-customer-group="${groupDomId(focusedCustomerId)}"]`,
    );
    target?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [focusedCustomerId]);

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
  const groupLineMap = useMemo(() => {
    const grouped = new Map<string, MatrixLine[]>();
    for (const line of lines) {
      const group = groupByOrderId.get(line.orderId);
      if (!group) continue;
      const key = `${rowKey(line)}:${group.id}`;
      grouped.set(key, [...(grouped.get(key) ?? []), line]);
    }
    return grouped;
  }, [groupByOrderId, lines]);

  const updateGroupedLines = (
    groupedLines: MatrixLine[],
    patch: Partial<MatrixLine>,
  ) => {
    const ids = new Set(groupedLines.map((line) => line.orderItemId));
    groupedLines.forEach((line) => dirty.current.add(line.orderItemId));
    const preparationWeights =
      Object.hasOwn(patch, "preparationActualWeightKg") &&
      patch.preparationActualWeightKg !== null
        ? distributeValue(groupedLines, patch.preparationActualWeightKg ?? 0)
        : [];
    const deliveryWeights =
      Object.hasOwn(patch, "deliveryActualWeightKg") &&
      patch.deliveryActualWeightKg !== null
        ? distributeValue(groupedLines, patch.deliveryActualWeightKg ?? 0)
        : [];
    const deliveryQuantities =
      Object.hasOwn(patch, "deliveredQuantity") &&
      typeof patch.deliveredQuantity === "number"
        ? distributeValue(groupedLines, patch.deliveredQuantity)
        : [];
    const indexById = new Map(
      groupedLines.map((line, index) => [line.orderItemId, index]),
    );

    const updatedLines = linesRef.current.map((line) => {
      if (!ids.has(line.orderItemId)) return line;
      const index = indexById.get(line.orderItemId) ?? 0;
      const next = { ...line, ...patch };
      if (typeof patch.preparationCheck === "boolean") {
        next.preparedQuantity = patch.preparationCheck
          ? line.requestedQuantity
          : 0;
      }
      if (Object.hasOwn(patch, "preparationActualWeightKg")) {
        next.preparationActualWeightKg =
          patch.preparationActualWeightKg === null
            ? null
            : preparationWeights[index];
      }
      if (typeof patch.deliveryCheck === "boolean") {
        next.deliveryCheck = patch.deliveryCheck;
      }
      if (
        Object.hasOwn(patch, "deliveredQuantity") &&
        typeof patch.deliveredQuantity === "number"
      ) {
        next.deliveredQuantity = deliveryQuantities[index];
      }
      if (Object.hasOwn(patch, "deliveryActualWeightKg")) {
        next.deliveryActualWeightKg =
          patch.deliveryActualWeightKg === null ? null : deliveryWeights[index];
      }
      return next;
    });
    linesRef.current = updatedLines;
    setLines(updatedLines);
  };

  const latestLine = (id: string) =>
    linesRef.current.find((line) => line.orderItemId === id);

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
      setMessage("Guardado.");
      if (result.data && typeof result.data === "object") {
        const response = result.data as {
          row_version?: unknown;
          order_updated_at?: unknown;
        };
        const version = Number(response.row_version);
        if (Number.isInteger(version)) {
          const versionedLines = linesRef.current.map((line) =>
            line.orderItemId === id
              ? {
                  ...line,
                  [versionField]: Math.max(line[versionField], version),
                }
              : line,
          );
          linesRef.current = versionedLines;
          setLines(versionedLines);
        }
        if (typeof response.order_updated_at === "string") {
          const orderId = latestLine(id)?.orderId;
          const updatedOrders = ordersRef.current.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  updatedAt:
                    String(response.order_updated_at) > order.updatedAt
                      ? String(response.order_updated_at)
                      : order.updatedAt,
                  status:
                    versionField === "preparationVersion"
                      ? "en_preparacion"
                      : order.status,
                }
              : order,
          );
          ordersRef.current = updatedOrders;
          setOrders(updatedOrders);
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

  const savePreparationLine = async (id: string) => {
    const previous = preparationSaveQueues.current.get(id) ?? Promise.resolve();
    const task = previous
      .catch(() => undefined)
      .then(async () => {
        const line = latestLine(id);
        if (!line) {
          return {
            line: null,
            result: { success: false, message: "Línea no disponible." },
          };
        }
        const result = await saveMatrixPreparationAction({
          orderItemId: line.orderItemId,
          expectedVersion: line.preparationVersion,
          preparedQuantity: line.preparedQuantity,
          preparationCheck: line.preparationCheck,
          actualWeightKg: null,
          note: line.preparationNote,
          idempotencyKey: idempotencyKey("prep"),
        });
        finishSave(line.orderItemId, result, "preparationVersion");
        return { line, result };
      });
    const tail = task.then(
      () => undefined,
      () => undefined,
    );
    preparationSaveQueues.current.set(id, tail);
    const output = await task;
    if (preparationSaveQueues.current.get(id) === tail) {
      preparationSaveQueues.current.delete(id);
      if (output.result.success) dirty.current.delete(id);
    }
    return output;
  };

  const saveGroupedPreparation = async (ids: string[]) => {
    const results = await Promise.all(ids.map(savePreparationLine));
    const currentLines = results
      .map(({ line }) => line)
      .filter((line): line is MatrixLine => Boolean(line));
    if (results.every(({ result }) => result.success)) {
      setRemotePending(false);
      setMessage(
        currentLines.length > 1
          ? `${currentLines.length} pedidos del cliente guardados.`
          : "Guardado.",
      );
    }
  };

  const saveDeliveryLine = async (id: string) => {
    const previous = deliverySaveQueues.current.get(id) ?? Promise.resolve();
    const task = previous
      .catch(() => undefined)
      .then(async () => {
        const line = latestLine(id);
        if (!line) {
          return {
            line: null,
            externalQuantity: 0,
            result: { success: false, message: "Línea no disponible." },
          };
        }
        const externalQuantity = Math.max(
          line.deliveredQuantity - line.preparedQuantity,
          0,
        );
        const result = await saveMatrixDeliveryAction({
          orderItemId: line.orderItemId,
          expectedVersion: line.deliveryVersion,
          externalQuantity,
          deliveredQuantity: line.deliveredQuantity,
          deliveryCheck: line.deliveryCheck,
          actualWeightKg: line.controlsActualWeight
            ? line.deliveryActualWeightKg
            : null,
          note:
            line.deliveryNote ||
            line.preparationNote ||
            (!line.preparedAt || !line.preparationCheck
              ? "Cantidad final registrada por Entrega."
              : ""),
          idempotencyKey: idempotencyKey("delivery"),
        });
        finishSave(line.orderItemId, result, "deliveryVersion");
        return { line, externalQuantity, result };
      });
    const tail = task.then(
      () => undefined,
      () => undefined,
    );
    deliverySaveQueues.current.set(id, tail);
    const output = await task;
    if (deliverySaveQueues.current.get(id) === tail) {
      deliverySaveQueues.current.delete(id);
      if (output.result.success) dirty.current.delete(id);
    }
    return output;
  };

  const saveGroupedDelivery = async (ids: string[]) => {
    const results = await Promise.all(ids.map(saveDeliveryLine));
    const currentLines = results
      .map(({ line }) => line)
      .filter((line): line is MatrixLine => Boolean(line));
    const savedLines = linesRef.current.map((line) => {
      const saved = results.find(
        ({ line: resultLine }) => resultLine?.orderItemId === line.orderItemId,
      );
      return saved
        ? { ...line, externalQuantity: saved.externalQuantity }
        : line;
    });
    linesRef.current = savedLines;
    setLines(savedLines);
    const success = results.every(({ result }) => result.success);
    if (success) {
      setRemotePending(false);
      setMessage(
        currentLines.length > 1
          ? `${currentLines.length} pedidos del cliente guardados.`
          : "Guardado.",
      );
    }
    return success;
  };

  const correctGroupedRequest = async (groupedLines: MatrixLine[]) => {
    const currentTotal = sumLines(groupedLines, "requestedQuantity");
    const value = Number(
      window.prompt("Nueva cantidad solicitada", String(currentTotal)),
    );
    if (!Number.isFinite(value) || value <= 0) return;
    const reason = window.prompt("Motivo de corrección") ?? "";
    if (reason.trim().length < 3) return;
    const distributed = distributeValue(groupedLines, value);
    const results = await Promise.all(
      groupedLines.map(async (line, index) => ({
        result: await correctMatrixRequestAction({
          orderItemId: line.orderItemId,
          expectedVersion: line.requestedVersion,
          requestedQuantity: distributed[index],
          reason,
          idempotencyKey: idempotencyKey("request"),
        }),
      })),
    );
    const failed = results.find(({ result }) => !result.success);
    setMessage(
      failed?.result.message ??
        `Cantidad actualizada en ${groupedLines.length} pedido${groupedLines.length === 1 ? "" : "s"}.`,
    );
    router.refresh();
  };

  const moveCustomer = async (index: number, delta: number) => {
    const next = [...customerGroups];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const flattenedOrders = next.flatMap((group) => group.orders);
    ordersRef.current = flattenedOrders;
    setOrders(flattenedOrders);
    const result = await reorderMatrixOrdersAction({
      operationalDate: data.operationalDate,
      orderIds: flattenedOrders.map((order) => order.id),
      expectedVersions: Object.fromEntries(
        orders.map((order) => [order.id, order.positionVersion]),
      ),
      idempotencyKey: idempotencyKey("reorder"),
    });
    setMessage(result.message);
    if (result.success) {
      const reordered = flattenedOrders.map((order, position) => ({
        ...order,
        position: position + 1,
        positionVersion: order.positionVersion + 1,
      }));
      ordersRef.current = reordered;
      setOrders(reordered);
    } else {
      ordersRef.current = orders;
      setOrders(orders);
    }
    router.refresh();
  };

  const actionForCustomer = async (
    group: MatrixCustomerGroup,
    action: "confirm" | "reopen",
  ) => {
    const groupOrderIds = new Set(group.orders.map((order) => order.id));
    const groupLines = linesRef.current.filter((line) =>
      groupOrderIds.has(line.orderId),
    );
    if (action === "confirm") {
      if (groupLines.some((line) => !line.deliveryCheck)) {
        setMessage(
          "Completa los campos rojos de peso o cantidad real antes de confirmar.",
        );
        return;
      }
      if (
        groupLines.some(
          (line) =>
            line.controlsActualWeight && line.deliveryActualWeightKg === null,
        )
      ) {
        setMessage("Completa los pesos reales marcados en rojo.");
        return;
      }
      if (
        groupLines.some(
          (line) =>
            line.controlsActualWeight &&
            line.deliveryActualWeightKg !== null &&
            line.deliveryActualWeightKg < line.preparedQuantity &&
            (line.deliveryNote || line.preparationNote).trim().length < 3,
        )
      ) {
        setMessage(
          "Explica en observaciones por qué el peso real es menor al preparado.",
        );
        return;
      }
    }
    const reason =
      action === "reopen"
        ? (window.prompt("Motivo para deshacer la entrega") ?? "")
        : "";
    if (action === "reopen" && reason.trim().length < 3) return;
    if (
      action === "confirm" &&
      !window.confirm(
        `¿Confirmar la entrega de ${group.customerName}? Esta acción registrará al usuario responsable.`,
      )
    ) {
      return;
    }
    setActionPending(`${group.id}:${action}`);
    if (action === "confirm") {
      setMessage("Guardando cantidades reales y confirmando la entrega...");
      const saved = await saveGroupedDelivery(
        groupLines.map((line) => line.orderItemId),
      );
      if (!saved) {
        setActionPending(null);
        setMessage(
          "No se pudieron guardar todas las cantidades reales. Revisa los campos marcados.",
        );
        return;
      }
    }
    const applicableOrders = ordersRef.current.flatMap((order) => {
      if (!groupOrderIds.has(order.id)) return [];
      const applies =
        action === "confirm"
          ? ["pendiente_preparacion", "en_preparacion", "preparado"].includes(
              order.status,
            ) && order.deliveryStatus !== "confirmado"
          : order.deliveryStatus === "confirmado";
      return applies ? [order] : [];
    });
    if (!applicableOrders.length) {
      setActionPending(null);
      setMessage("Este cliente todavía no está listo para esa confirmación.");
      return;
    }
    const results = await Promise.all(
      applicableOrders.map(async (order) => {
        const common = {
          orderId: order.id,
          expectedUpdatedAt: order.updatedAt,
          idempotencyKey: idempotencyKey(action),
        };
        return action === "confirm"
          ? confirmMatrixDeliveryAction(common)
          : reopenMatrixDeliveryAction({ ...common, reason });
      }),
    );
    const failed = results.find((result) => !result.success);
    setMessage(
      failed
        ? `No se pudo ${action === "confirm" ? "confirmar" : "deshacer"} la entrega: ${failed.message}`
        : `${applicableOrders.length} pedido${applicableOrders.length === 1 ? "" : "s"} actualizado${applicableOrders.length === 1 ? "" : "s"}.`,
    );
    setActionPending(null);
    router.refresh();
  };

  const canAdmin = data.role === "administrador";
  const visibleStages: MatrixStage[] = canAdmin
    ? ["pedido", "preparacion", "entrega", "resumen"]
    : [defaultStage(data.role)];
  const headers = stageHeaders(stage);
  const guidance = stageGuidance(stage);
  const matrixColumnCount = 3 + customerGroups.length * headers.length + 1;
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
          {message ? (
            <span className="text-muted-foreground">{message}</span>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <p className="font-semibold">{guidance.title}</p>
        <p className="mt-1 leading-5 text-sky-900">{guidance.detail}</p>
      </div>

      {!customerGroups.length ? (
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
                {customerGroups.map((group, groupIndex) => {
                  const focused = group.id === focusedCustomerId;
                  return (
                    <th
                      key={group.id}
                      data-customer-group={groupDomId(group.id)}
                      colSpan={headers.length}
                      className={`sticky top-0 z-40 h-[86px] border-b border-l-2 border-r px-2 py-1.5 text-left ${
                        focused
                          ? "border-sky-500 bg-sky-100 ring-2 ring-inset ring-sky-500"
                          : "bg-slate-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block max-w-64 truncate text-xs font-semibold sm:text-sm">
                            {group.customerName}
                          </span>
                          <span className="block max-w-64 truncate font-normal text-muted-foreground">
                            {group.orders.length > 1
                              ? `${group.orders.length} pedidos: ${group.references}`
                              : group.references}{" "}
                            · {group.locationLabel}
                          </span>
                          <span className="mt-1 inline-flex rounded-full border border-slate-300 bg-white/80 px-1.5 py-0.5 text-[9px] font-semibold text-slate-700">
                            {groupStatus(group)}
                          </span>
                        </span>
                        <span className="flex shrink-0 gap-0.5">
                          {canAdmin ? (
                            <>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label="Mover cliente antes"
                                onClick={() =>
                                  void moveCustomer(groupIndex, -1)
                                }
                              >
                                <ChevronLeft />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label="Mover cliente después"
                                onClick={() => void moveCustomer(groupIndex, 1)}
                              >
                                <ChevronRight />
                              </Button>
                            </>
                          ) : null}
                          {stage === "entrega" &&
                          group.orders.some(
                            (order) =>
                              [
                                "pendiente_preparacion",
                                "en_preparacion",
                                "preparado",
                              ].includes(order.status) &&
                              order.deliveryStatus !== "confirmado",
                          ) ? (
                            <Button
                              size="xs"
                              disabled={actionPending === `${group.id}:confirm`}
                              onClick={() =>
                                void actionForCustomer(group, "confirm")
                              }
                            >
                              Confirmar entrega
                            </Button>
                          ) : null}
                          {stage === "entrega" &&
                          data.role === "entregador" &&
                          group.orders.some(
                            (order) => order.deliveryStatus === "confirmado",
                          ) ? (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={actionPending === `${group.id}:reopen`}
                              onClick={() =>
                                void actionForCustomer(group, "reopen")
                              }
                            >
                              Deshacer entrega
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
                {customerGroups.flatMap((group) =>
                  headers.map((header, index) => (
                    <th
                      key={`${group.id}:${header}`}
                      className={`sticky top-[86px] z-40 min-w-[68px] border-b border-r px-1.5 py-1.5 text-center font-semibold ${
                        index === 0 ? "border-l-2" : ""
                      } ${
                        group.id === focusedCustomerId
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
                        style={{
                          backgroundColor: row.productColor ?? "#FFFFFF",
                        }}
                        className="sticky left-0 z-30 border-b border-r px-1 py-1.5 text-center text-muted-foreground"
                      >
                        {index + 1}
                      </td>
                      <td
                        style={{
                          backgroundColor: row.productColor ?? "#FFFFFF",
                        }}
                        className="sticky left-9 z-30 max-w-40 border-b border-r px-2 py-1.5 font-medium md:max-w-56"
                      >
                        {row.productName}
                      </td>
                      <td
                        style={{
                          backgroundColor: row.productColor ?? "#FFFFFF",
                        }}
                        className="sticky left-[196px] z-30 border-b border-r px-1.5 py-1.5 md:left-[260px]"
                      >
                        <span className="block uppercase">
                          {row.sourceLabel}
                        </span>
                      </td>
                      {customerGroups.map((group) => {
                        const groupedLines =
                          groupLineMap.get(`${rowKey(row)}:${group.id}`) ?? [];
                        const line = groupedLines.length
                          ? aggregateLines(groupedLines)
                          : null;
                        const focused = group.id === focusedCustomerId;
                        const editable =
                          stage === "preparacion"
                            ? group.orders.every((order) =>
                                [
                                  "pendiente_preparacion",
                                  "en_preparacion",
                                ].includes(order.status),
                              )
                            : stage === "entrega"
                              ? group.orders.every(
                                  (order) =>
                                    [
                                      "pendiente_preparacion",
                                      "en_preparacion",
                                      "preparado",
                                    ].includes(order.status) &&
                                    order.deliveryStatus !== "confirmado",
                                )
                              : true;
                        return line ? (
                          <DesktopOrderCells
                            key={group.id}
                            line={line}
                            stage={stage}
                            canAdmin={canAdmin}
                            focused={focused}
                            editable={editable}
                            onChange={(patch) =>
                              updateGroupedLines(groupedLines, patch)
                            }
                            onSavePreparation={() =>
                              void saveGroupedPreparation(
                                groupedLines.map((item) => item.orderItemId),
                              )
                            }
                            onSaveDelivery={() =>
                              void saveGroupedDelivery(
                                groupedLines.map((item) => item.orderItemId),
                              )
                            }
                            onCorrect={() =>
                              void correctGroupedRequest(groupedLines)
                            }
                          />
                        ) : (
                          <td
                            key={group.id}
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
                {customerGroups.map((group) => {
                  const orderIds = new Set(
                    group.orders.map((order) => order.id),
                  );
                  const customerLines = lines.filter((line) =>
                    orderIds.has(line.orderId),
                  );
                  const customerRows = new Map<string, MatrixLine[]>();
                  customerLines.forEach((line) => {
                    const key = rowKey(line);
                    customerRows.set(key, [
                      ...(customerRows.get(key) ?? []),
                      line,
                    ]);
                  });
                  const completed = [...customerRows.values()].filter(
                    (groupedLines) =>
                      stage === "entrega"
                        ? groupedLines.every((line) => line.deliveryCheck)
                        : groupedLines.every((line) => line.preparationCheck),
                  ).length;
                  return (
                    <th
                      key={group.id}
                      colSpan={headers.length}
                      className={`sticky bottom-0 z-30 border-l-2 border-t border-r px-3 py-2 text-left ${
                        group.id === focusedCustomerId
                          ? "bg-sky-100"
                          : "bg-slate-100"
                      }`}
                    >
                      {customerRows.size} líneas · {completed} checks
                    </th>
                  );
                })}
                <th className="sticky bottom-0 z-30 border-l-2 border-t bg-emerald-100 px-3 py-2">
                  {rows.length} líneas
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
  editable: boolean;
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
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onBlur: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex justify-center">
      <input
        aria-label={label}
        className="size-4 accent-emerald-700"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
          requestAnimationFrame(onBlur);
        }}
      />
    </label>
  );
}

function NoteEditor({
  label,
  value,
  onChange,
  onBlur,
  disabled = false,
  attention = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  attention?: boolean;
}) {
  return (
    <Input
      aria-label={label}
      className={`h-7 min-w-36 px-2 text-xs ${
        attention ? "border-rose-500 bg-rose-50 ring-1 ring-rose-300" : ""
      }`}
      value={value}
      placeholder="Nota"
      disabled={disabled}
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
  disabled = false,
  attention = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur: () => void;
  disabled?: boolean;
  attention?: boolean;
}) {
  return (
    <div className="relative min-w-24">
      <Input
        aria-label={label}
        className={`h-7 min-w-24 pr-7 text-right text-xs ${
          attention ? "border-rose-500 bg-rose-50 ring-1 ring-rose-300" : ""
        }`}
        type="number"
        min={0}
        step="0.5"
        value={value ?? ""}
        placeholder="0"
        disabled={disabled}
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

function QuantityEditor({
  label,
  value,
  onChange,
  onBlur,
  disabled = false,
  attention = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur: () => void;
  disabled?: boolean;
  attention?: boolean;
}) {
  return (
    <Input
      aria-label={label}
      className={`h-7 min-w-24 text-right text-xs font-semibold ${
        attention ? "border-rose-500 bg-rose-50 ring-1 ring-rose-300" : ""
      }`}
      type="number"
      min={0}
      step="0.5"
      value={value ?? ""}
      placeholder="Completar"
      disabled={disabled}
      onChange={(event) =>
        onChange(
          event.target.value === ""
            ? null
            : Math.max(Number(event.target.value), 0),
        )
      }
      onBlur={onBlur}
    />
  );
}

function DesktopOrderCells(props: CellProps) {
  const {
    line,
    stage,
    canAdmin,
    focused,
    editable,
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
        <td
          style={cellStyle}
          className={`${cellClass} border-l-2 font-semibold`}
        >
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
            disabled={!editable}
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
          <NoteEditor
            label={`Observación bodega ${line.productName}`}
            value={line.preparationNote}
            disabled={!editable}
            onChange={(value) => onChange({ preparationNote: value })}
            onBlur={onSavePreparation}
          />
        </td>
      </>
    );
  }
  if (stage === "entrega") {
    const deliveryReady = Boolean(line.preparedAt);
    const needsDeliveryReview =
      !hasCompletePreparation(line) &&
      !line.deliveredAt &&
      line.deliveryVersion === 0;
    const actualQuantity =
      needsDeliveryReview && !line.deliveryCheck
        ? null
        : line.deliveredQuantity;
    const actualWeight =
      needsDeliveryReview && !line.deliveryCheck
        ? null
        : line.deliveryActualWeightKg;
    const lowerThanPrepared =
      line.controlsActualWeight &&
      line.deliveryActualWeightKg !== null &&
      line.deliveryActualWeightKg < line.preparedQuantity;
    const noteMissingForShortfall =
      lowerThanPrepared && line.deliveryNote.trim().length < 3;
    const deliveryDisabled = !editable;
    return (
      <>
        <td style={cellStyle} className={`${cellClass} border-l-2`}>
          <span className="font-semibold">
            {formatQuantity(line.requestedQuantity)}
          </span>
          {deliveryReady ? (
            <span className="mt-1 block text-[9px] text-muted-foreground">
              Inventario: {formatQuantity(line.preparedQuantity)}
            </span>
          ) : null}
        </td>
        <td style={cellStyle} className={cellClass}>
          <input
            aria-label={`Check de Inventario ${line.productName}`}
            className="size-4 accent-emerald-700"
            type="checkbox"
            checked={line.preparationCheck}
            disabled
          />
        </td>
        <td
          style={cellStyle}
          className={`${cellClass} ${
            !deliveryReady || needsDeliveryReview
              ? "bg-rose-50/90 ring-1 ring-inset ring-rose-300"
              : ""
          }`}
        >
          {line.controlsActualWeight ? (
            <WeightEditor
              label={`Peso real entrega ${line.productName}`}
              value={actualWeight}
              disabled={deliveryDisabled}
              attention={!deliveryReady || needsDeliveryReview}
              onChange={(value) =>
                onChange({
                  deliveryActualWeightKg: value,
                  deliveredQuantity:
                    value === null
                      ? line.deliveredQuantity
                      : line.preparedQuantity,
                  deliveryCheck: value !== null,
                })
              }
              onBlur={onSaveDelivery}
            />
          ) : (
            <QuantityEditor
              label={`Cantidad real entregada de ${line.productName}`}
              value={actualQuantity}
              disabled={deliveryDisabled}
              attention={!deliveryReady || needsDeliveryReview}
              onChange={(value) => {
                if (value === null) return;
                onChange({
                  deliveredQuantity: value,
                  deliveryCheck: true,
                });
              }}
              onBlur={onSaveDelivery}
            />
          )}
          {deliveryReady && !needsDeliveryReview ? (
            <span className="mt-1 block text-[9px] font-medium text-emerald-800">
              Valor inicial de Inventario · editable
            </span>
          ) : null}
        </td>
        <td style={cellStyle} className={cellClass}>
          {line.preparationNote ? (
            <span className="mb-1 block text-left text-[9px] font-medium text-amber-800">
              Inventario: {line.preparationNote}
            </span>
          ) : null}
          <NoteEditor
            label={`Observación entrega ${line.productName}`}
            value={line.deliveryNote}
            disabled={deliveryDisabled}
            attention={needsDeliveryReview || noteMissingForShortfall}
            onChange={(value) => onChange({ deliveryNote: value })}
            onBlur={onSaveDelivery}
          />
          {!deliveryReady ? (
            <span className="mt-1 block text-[9px] font-semibold text-rose-700">
              Pendiente de Inventario
            </span>
          ) : null}
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
        {line.controlsActualWeight ? (line.deliveryActualWeightKg ?? "—") : "—"}
        {line.controlsActualWeight && line.deliveryActualWeightKg !== null
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
