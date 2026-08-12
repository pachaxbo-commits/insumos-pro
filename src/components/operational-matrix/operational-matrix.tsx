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
import { Textarea } from "@/components/ui/textarea";
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
  MatrixWeightUnit,
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
  return requested ?? "preparacion";
}

function rowKey(line: MatrixLine) {
  return `${line.productId}:${line.sourceLabel}`;
}

function groupDomId(value: string) {
  return encodeURIComponent(value);
}

function stageHeaders(stage: MatrixStage) {
  if (stage === "preparacion") {
    return ["CANT", "CHECK", "PESO/CANT. REAL", "OBSERVACIÓN"];
  }
  if (stage === "entrega") {
    return [
      "CANT",
      "CHECK INV./ENT.",
      "PREPARADO",
      "ENTREGADO REAL",
      "OBSERVACIÓN",
    ];
  }
  if (stage === "resumen") {
    return [
      "SOLICITADO",
      "CHECK",
      "CANT. REAL ENTREGADA",
      "PESO REAL ENTREGADO",
      "OBSERVACIÓN",
    ];
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
        "Confirma la cantidad y registra por separado el peso real. Ambos datos pueden corregirse sin desmarcar un check ya confirmado. El peso solo se usa para el total cuando el producto tiene un precio por peso configurado.",
    };
  }
  if (stage === "entrega") {
    return {
      title: "Confirmación del Entregador",
      detail:
        "Compara lo registrado por Inventario en PREPARADO con la cantidad y el peso finales de ENTREGADO REAL. Entrega puede modificar sus valores sin desmarcar el check y explicar aumentos o faltantes en Observación.",
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
  generalNotes: string;
  orders: MatrixOrder[];
};

function uniqueText(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const comparisonKey = value.trim();
    if (!comparisonKey || seen.has(comparisonKey)) continue;
    seen.add(comparisonKey);
    result.push(value);
  }
  return result;
}

function sumLines(
  lines: MatrixLine[],
  field:
    | "requestedQuantity"
    | "requestedBaseQuantity"
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
    requestedBaseQuantity: sumLines(lines, "requestedBaseQuantity"),
    requestedNote: uniqueText(lines.map((line) => line.requestedNote)).join(
      " | ",
    ),
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
    deliveryCheck: lines.every(hasDeliveryCheck),
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

function hasDeliveryCheck(line: MatrixLine) {
  return line.preparationCheck || line.deliveryCheck;
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
            ? line.preparationActualWeightKg
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
        requestedBaseQuantity: current.requestedBaseQuantity,
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
        current.generalNotes = uniqueText(
          current.orders.map((item) => item.customerNotes),
        ).join(" | ");
        continue;
      }
      groups.set(order.customerKey, {
        id: order.customerKey,
        customerName: order.customerName,
        locationLabel: order.locationLabel ?? "",
        references: order.reference,
        generalNotes: order.customerNotes,
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
    const preparationQuantities =
      Object.hasOwn(patch, "preparedQuantity") &&
      typeof patch.preparedQuantity === "number"
        ? distributeValue(groupedLines, patch.preparedQuantity)
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
      if (
        Object.hasOwn(patch, "preparedQuantity") &&
        typeof patch.preparedQuantity === "number"
      ) {
        next.preparedQuantity = preparationQuantities[index];
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

  const updateMissingDeliveryChecks = (
    groupedLines: MatrixLine[],
    checked: boolean,
  ) => {
    const missingIds = new Set(
      groupedLines
        .filter((line) => !line.preparationCheck)
        .map((line) => line.orderItemId),
    );
    if (!missingIds.size) return;
    missingIds.forEach((id) => dirty.current.add(id));
    const updatedLines = linesRef.current.map((line) => {
      if (!missingIds.has(line.orderItemId)) return line;
      return {
        ...line,
        deliveryCheck: checked,
        deliveredQuantity:
          checked && line.deliveredQuantity <= 0.000001
            ? line.requestedQuantity
            : line.deliveredQuantity,
        deliveryActualWeightKg:
          checked &&
          line.controlsActualWeight &&
          (line.deliveryActualWeightKg === null ||
            line.deliveryActualWeightKg <= 0.000001)
            ? line.preparationActualWeightKg
            : line.deliveryActualWeightKg,
      };
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
          actualWeightKg: line.controlsActualWeight
            ? line.preparationActualWeightKg
            : null,
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
            effectiveDeliveryCheck: false,
            result: { success: false, message: "Línea no disponible." },
          };
        }
        const externalQuantity = Math.max(
          line.deliveredQuantity - line.preparedQuantity,
          0,
        );
        const effectiveDeliveryCheck = hasDeliveryCheck(line);
        const result = await saveMatrixDeliveryAction({
          orderItemId: line.orderItemId,
          expectedVersion: line.deliveryVersion,
          externalQuantity,
          deliveredQuantity: line.deliveredQuantity,
          deliveryCheck: effectiveDeliveryCheck,
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
        return { line, externalQuantity, effectiveDeliveryCheck, result };
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
        ? {
            ...line,
            externalQuantity: saved.externalQuantity,
            deliveryCheck: saved.effectiveDeliveryCheck ?? line.deliveryCheck,
          }
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
      if (groupLines.some((line) => !hasDeliveryCheck(line))) {
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
            line.deliveryActualWeightKg <
              (line.preparationActualWeightKg ?? line.preparedQuantity) &&
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
                          {group.generalNotes ? (
                            <span
                              className="mt-1 block max-w-64 truncate text-[10px] font-semibold text-amber-800"
                              title={group.generalNotes}
                            >
                              Nota del pedido: {group.generalNotes}
                            </span>
                          ) : null}
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
                          ["administrador", "entregador"].includes(data.role) &&
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
                          : header === "PREPARADO"
                            ? "min-w-32"
                            : [
                                  "PESO REAL",
                                  "ENTREGADO REAL",
                                  "CANT. REAL ENTREGADA",
                                  "PESO REAL ENTREGADO",
                                ].includes(header)
                              ? "min-w-40"
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
                            weightUnits={data.weightUnits}
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
                            onToggleMissingDeliveryCheck={(checked) =>
                              updateMissingDeliveryChecks(groupedLines, checked)
                            }
                            onSaveMissingDeliveryCheck={() =>
                              void saveGroupedDelivery(
                                groupedLines
                                  .filter((item) => !item.preparationCheck)
                                  .map((item) => item.orderItemId),
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
                        ? groupedLines.every(hasDeliveryCheck)
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
  weightUnits: MatrixWeightUnit[];
  stage: MatrixStage;
  canAdmin: boolean;
  focused: boolean;
  editable: boolean;
  onChange: (patch: Partial<MatrixLine>) => void;
  onSavePreparation: () => void;
  onSaveDelivery: () => void;
  onToggleMissingDeliveryCheck: (checked: boolean) => void;
  onSaveMissingDeliveryCheck: () => void;
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
    <Textarea
      aria-label={label}
      className={`min-h-12 min-w-44 resize-y whitespace-pre-wrap px-2 py-1.5 text-xs ${
        attention ? "border-rose-500 bg-rose-50 ring-1 ring-rose-300" : ""
      }`}
      value={value}
      rows={2}
      maxLength={500}
      placeholder="Escribe una observación"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => event.stopPropagation()}
      onBlur={onBlur}
    />
  );
}

function normalizedUnitLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, " ")
    .trim();
}

function findWeightUnit(
  units: MatrixWeightUnit[],
  ...labels: string[]
) {
  for (const label of labels) {
    const candidate = normalizedUnitLabel(label);
    if (!candidate) continue;
    const unit = units.find((option) =>
      [option.code, option.name, option.symbol]
        .map(normalizedUnitLabel)
        .includes(candidate),
    );
    if (unit) return unit;
  }
  return undefined;
}

function weightFromKilograms(
  value: number | null,
  unit: MatrixWeightUnit,
) {
  if (value === null) return null;
  return Number((value / unit.kilograms).toFixed(6));
}

function weightToKilograms(
  value: number | null,
  unit: MatrixWeightUnit,
) {
  if (value === null) return null;
  return Number((value * unit.kilograms).toFixed(6));
}

function requestedWeightInKilograms(
  line: MatrixLine,
  weightUnits: MatrixWeightUnit[],
) {
  const unit = findWeightUnit(
    weightUnits,
    line.sourceLabel,
    line.baseUnitSymbol,
  );
  return unit
    ? weightToKilograms(line.requestedQuantity, unit)
    : null;
}

function decimalInputText(value: number | null) {
  return value === null ? "" : String(value);
}

function parseDecimalInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d*(?:\.\d*)?$/.test(normalized) || normalized.endsWith(".")) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : undefined;
}

function DecimalInput({
  label,
  value,
  onChange,
  onBlur,
  disabled,
  attention,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur: () => void;
  disabled: boolean;
  attention: boolean;
}) {
  const [rawValue, setRawValue] = useState(() => decimalInputText(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setRawValue(decimalInputText(value));
  }, [value]);

  const emitValue = (next: string) => {
    const parsed = parseDecimalInput(next);
    if (parsed !== undefined) onChange(parsed);
    return parsed;
  };

  return (
    <Input
      aria-label={label}
      className={`h-7 min-w-24 text-right text-xs font-semibold ${
        attention ? "border-rose-500 bg-rose-50 ring-1 ring-rose-300" : ""
      }`}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      pattern="[0-9]*[.,]?[0-9]*"
      value={rawValue}
      placeholder="0"
      disabled={disabled}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => {
        const next = event.target.value.replace(/\s/g, "");
        if (!/^\d*(?:[.,]\d*)?$/.test(next)) return;
        setRawValue(next);
        emitValue(next);
      }}
      onBlur={() => {
        focused.current = false;
        const parsed = emitValue(rawValue);
        if (parsed === undefined) {
          setRawValue(decimalInputText(value));
        } else {
          setRawValue(decimalInputText(parsed));
        }
        onBlur();
      }}
    />
  );
}

function MeasuredQuantityEditor({
  label,
  quantityValue,
  actualWeightKg,
  sourceLabel,
  sourceUnitHint,
  weightUnits,
  onQuantityChange,
  onWeightChange,
  onBlur,
  disabled = false,
  attention = false,
}: {
  label: string;
  quantityValue: number | null;
  actualWeightKg: number | null;
  sourceLabel: string;
  sourceUnitHint: string;
  weightUnits: MatrixWeightUnit[];
  onQuantityChange: (value: number | null) => void;
  onWeightChange: (value: number | null) => void;
  onBlur: () => void;
  disabled?: boolean;
  attention?: boolean;
}) {
  const sourceWeightUnit = findWeightUnit(
    weightUnits,
    sourceLabel,
    sourceUnitHint,
  );
  const defaultWeightUnit =
    sourceWeightUnit ??
    weightUnits.find((option) => option.code === "kg") ??
    weightUnits[0];
  const [weightUnitId, setWeightUnitId] = useState(
    () => defaultWeightUnit?.id ?? "",
  );
  const selectedWeightUnit =
    weightUnits.find((option) => option.id === weightUnitId) ??
    defaultWeightUnit;
  const displayWeight = selectedWeightUnit
    ? weightFromKilograms(actualWeightKg, selectedWeightUnit)
    : null;

  return (
    <div className="flex min-w-40 flex-col gap-1.5">
      <div>
        <span className="mb-0.5 block text-left text-[9px] font-medium text-muted-foreground">
          Cantidad real
        </span>
        <div className="flex items-center gap-1">
          <DecimalInput
            label={`Cantidad comercial de ${label.toLowerCase()}`}
            value={quantityValue}
            disabled={disabled}
            attention={attention}
            onChange={onQuantityChange}
            onBlur={onBlur}
          />
          <span className="min-w-12 text-left text-[10px] font-semibold uppercase">
            {sourceLabel}
          </span>
        </div>
      </div>
      <div>
        <span className="mb-0.5 block text-left text-[9px] font-medium text-muted-foreground">
          Peso real
        </span>
        <div className="flex items-center gap-1">
          <DecimalInput
            label={label}
            value={displayWeight}
            disabled={disabled || !selectedWeightUnit}
            attention={attention}
            onChange={(value) =>
              onWeightChange(
                selectedWeightUnit
                  ? weightToKilograms(value, selectedWeightUnit)
                  : null,
              )
            }
            onBlur={onBlur}
          />
          <select
            aria-label={`Unidad de ${label.toLowerCase()}`}
            className="h-7 rounded-md border border-input bg-background px-1 text-[11px] font-semibold"
            value={selectedWeightUnit?.id ?? ""}
            disabled={disabled || weightUnits.length === 0}
            onChange={(event) => setWeightUnitId(event.target.value)}
          >
            {weightUnits.length === 0 ? (
              <option value="">Sin unidad</option>
            ) : null}
            {weightUnits.map((option) => (
              <option key={option.id} value={option.id}>
                {option.symbol || option.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function PreparedMeasurementDisplay({
  line,
  weightUnits,
}: {
  line: MatrixLine;
  weightUnits: MatrixWeightUnit[];
}) {
  const kilogramUnit = findWeightUnit(weightUnits, "kg", "kilogramo");
  const gramUnit = findWeightUnit(weightUnits, "gr", "g", "gramo");
  const displayUnit =
    line.preparationActualWeightKg !== null &&
    line.preparationActualWeightKg < 1 &&
    gramUnit
      ? gramUnit
      : (kilogramUnit ?? gramUnit ?? weightUnits[0]);
  const displayWeight = displayUnit
    ? weightFromKilograms(line.preparationActualWeightKg, displayUnit)
    : null;

  return (
    <div
      className="min-w-32 rounded-md border border-slate-300 bg-slate-50/80 px-2 py-1.5 text-left"
      aria-label={`Preparado por Inventario para ${line.productName}`}
    >
      <span className="block text-[9px] font-medium text-muted-foreground">
        Cantidad preparada
      </span>
      <span className="block font-semibold">
        {formatQuantity(line.preparedQuantity)} {line.sourceLabel}
      </span>
      <span className="mt-1 block text-[9px] font-medium text-muted-foreground">
        Peso preparado
      </span>
      <span className="block font-semibold">
        {displayWeight === null || !displayUnit
          ? "Sin registrar"
          : `${formatQuantity(displayWeight)} ${displayUnit.symbol || displayUnit.name}`}
      </span>
    </div>
  );
}

function WeightPricingHint({ line }: { line: MatrixLine }) {
  return (
    <span
      className={`mt-1 block text-[9px] font-medium ${
        line.hasWeightBasedPrice ? "text-emerald-800" : "text-amber-800"
      }`}
    >
      {line.hasWeightBasedPrice
        ? `El total usa el peso real y el precio/${line.priceUnitSymbol}.`
        : "Peso real informativo · configura un precio por unidad de peso para costearlo."}
    </span>
  );
}

function QuantityEditor({
  label,
  value,
  unitLabel,
  onChange,
  onBlur,
  disabled = false,
  attention = false,
}: {
  label: string;
  value: number | null;
  unitLabel: string;
  onChange: (value: number | null) => void;
  onBlur: () => void;
  disabled?: boolean;
  attention?: boolean;
}) {
  return (
    <div className="flex min-w-36 items-center gap-1">
      <DecimalInput
        label={label}
        value={value}
        disabled={disabled}
        attention={attention}
        onChange={onChange}
        onBlur={onBlur}
      />
      <span
        title={unitLabel}
        className="flex h-7 max-w-24 items-center truncate rounded-md border border-input bg-background px-2 text-[10px] font-semibold uppercase"
      >
        {unitLabel}
      </span>
    </div>
  );
}

function DesktopOrderCells(props: CellProps) {
  const {
    line,
    weightUnits,
    stage,
    canAdmin,
    focused,
    editable,
    onChange,
    onSavePreparation,
    onSaveDelivery,
    onToggleMissingDeliveryCheck,
    onSaveMissingDeliveryCheck,
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
          {line.requestedNote ? (
            <span className="mb-1 block max-w-44 whitespace-pre-wrap break-words text-left text-[10px] font-medium text-amber-900">
              {line.requestedNote}
            </span>
          ) : null}
          {canAdmin ? (
            <Button
              size="xs"
              variant="outline"
              type="button"
              onClick={onCorrect}
            >
              Editar
            </Button>
          ) : line.requestedNote ? null : (
            "—"
          )}
        </td>
      </>
    );
  }
  if (stage === "preparacion") {
    const canMarkPreparationComplete =
      line.preparedQuantity <= 0.000001 ||
      Math.abs(line.preparedQuantity - line.requestedQuantity) < 0.000001;
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
            disabled={
              !editable ||
              (!line.preparationCheck && !canMarkPreparationComplete)
            }
            onChange={(checked) =>
              onChange({
                preparationCheck: checked,
                ...(checked && line.preparedQuantity <= 0.000001
                  ? { preparedQuantity: line.requestedQuantity }
                  : {}),
                ...(checked &&
                line.controlsActualWeight &&
                findWeightUnit(
                  weightUnits,
                  line.sourceLabel,
                  line.baseUnitSymbol,
                ) !== undefined &&
                (line.preparationActualWeightKg === null ||
                  line.preparationActualWeightKg <= 0.000001)
                  ? {
                      preparationActualWeightKg:
                        requestedWeightInKilograms(line, weightUnits),
                    }
                  : {}),
              })
            }
            onBlur={onSavePreparation}
          />
        </td>
        <td style={cellStyle} className={cellClass}>
          {line.controlsActualWeight ? (
            <MeasuredQuantityEditor
              label={`Peso real preparado de ${line.productName}`}
              quantityValue={line.preparedQuantity}
              actualWeightKg={line.preparationActualWeightKg}
              sourceLabel={line.sourceLabel}
              sourceUnitHint={line.baseUnitSymbol}
              weightUnits={weightUnits}
              disabled={!editable}
              attention={!line.preparedAt}
              onQuantityChange={(value) =>
                onChange({
                  preparedQuantity: value ?? 0,
                })
              }
              onWeightChange={(value) =>
                onChange({
                  preparationActualWeightKg: value,
                })
              }
              onBlur={onSavePreparation}
            />
          ) : (
            <QuantityEditor
              label={`Cantidad real preparada de ${line.productName}`}
              value={line.preparedQuantity}
              unitLabel={line.sourceLabel}
              disabled={!editable}
              attention={!line.preparedAt}
              onChange={(value) =>
                onChange({
                  preparedQuantity: value ?? 0,
                })
              }
              onBlur={onSavePreparation}
            />
          )}
          {line.controlsActualWeight ? <WeightPricingHint line={line} /> : null}
        </td>
        <td style={cellStyle} className={cellClass}>
          {line.requestedNote ? (
            <span className="mb-1 block max-w-44 whitespace-pre-wrap break-words text-left text-[9px] font-semibold text-amber-900">
              Pedido: {line.requestedNote}
            </span>
          ) : null}
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
    const lowerThanPrepared =
      line.controlsActualWeight &&
      line.deliveryActualWeightKg !== null &&
      line.deliveryActualWeightKg <
        (line.preparationActualWeightKg ?? line.preparedQuantity);
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
          <CheckEditor
            label={
              line.preparationCheck
                ? `Check de Inventario ${line.productName}`
                : `Check de Entrega faltante ${line.productName}`
            }
            checked={hasDeliveryCheck(line)}
            disabled={deliveryDisabled || line.preparationCheck}
            onChange={onToggleMissingDeliveryCheck}
            onBlur={onSaveMissingDeliveryCheck}
          />
        </td>
        <td style={cellStyle} className={cellClass}>
          <PreparedMeasurementDisplay
            line={line}
            weightUnits={weightUnits}
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
            <MeasuredQuantityEditor
              label={`Peso real entrega ${line.productName}`}
              quantityValue={line.deliveredQuantity}
              actualWeightKg={line.deliveryActualWeightKg}
              sourceLabel={line.sourceLabel}
              sourceUnitHint={line.baseUnitSymbol}
              weightUnits={weightUnits}
              disabled={deliveryDisabled}
              attention={!deliveryReady || needsDeliveryReview}
              onQuantityChange={(value) =>
                onChange({
                  deliveredQuantity: value ?? 0,
                })
              }
              onWeightChange={(value) =>
                onChange({
                  deliveryActualWeightKg: value,
                })
              }
              onBlur={onSaveDelivery}
            />
          ) : (
            <QuantityEditor
              label={`Cantidad real entregada de ${line.productName}`}
              value={line.deliveredQuantity}
              unitLabel={line.sourceLabel}
              disabled={deliveryDisabled}
              attention={!deliveryReady || needsDeliveryReview}
              onChange={(value) =>
                onChange({
                  deliveredQuantity: value ?? 0,
                })
              }
              onBlur={onSaveDelivery}
            />
          )}
          {line.controlsActualWeight ? <WeightPricingHint line={line} /> : null}
          {deliveryReady && !needsDeliveryReview ? (
            <span className="mt-1 block text-[9px] font-medium text-emerald-800">
              Valor inicial de Inventario · editable
            </span>
          ) : null}
        </td>
        <td style={cellStyle} className={cellClass}>
          {line.requestedNote ? (
            <span className="mb-1 block whitespace-pre-wrap break-words text-left text-[9px] font-semibold text-amber-900">
              Pedido: {line.requestedNote}
            </span>
          ) : null}
          {line.preparationNote ? (
            <span className="mb-1 block whitespace-pre-wrap break-words text-left text-[9px] font-medium text-amber-800">
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
      <td style={cellStyle} className={`${cellClass} font-semibold`}>
        {formatQuantity(line.deliveredQuantity)}
      </td>
      <td style={cellStyle} className={cellClass}>
        {line.controlsActualWeight && line.deliveryActualWeightKg !== null
          ? `${formatQuantity(line.deliveryActualWeightKg)} kg`
          : "—"}
      </td>
      <td
        style={cellStyle}
        className={`${cellClass} min-w-36 whitespace-pre-wrap break-words text-left`}
      >
        {line.deliveryNote || line.preparationNote || line.requestedNote || "—"}
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
