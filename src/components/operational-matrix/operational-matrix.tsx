"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  quantityInOriginalUnit,
  quantityInSelectedUnit,
} from "@/lib/operational-matrix/quantity-units";
import { actionableOrders, linesForOrder } from "@/lib/operational-matrix/form-scope";
import { summarizeVisibleProductChecks } from "@/lib/operational-matrix/visible-check-counts";
import { suggestWarehouseSplit } from "@/lib/operational-matrix/stock-suggestion";
import { allocationForDeliveryOrigin } from "@/lib/operational-matrix/delivery-origin-choice";
import type { DeliveryOriginChoice } from "@/lib/operational-matrix/delivery-origin-choice";
import {
  applyAutomaticDeliveryValues,
  preparedQuantityAfterCheck,
  updateDeliveryChecks,
} from "@/lib/operational-matrix/line-state";
import {
  originDistributionIsResolved,
  originDistributionMatches,
  originDistributionTotal,
} from "@/lib/operational-matrix/origin-distribution";
import {
  classifySameDayDeliverySourceAction,
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
  MatrixQuantityUnit,
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
  if (role === "supervisor") return "preparacion";
  return "pedido";
}

function allowedStage(
  role: OperationalMatrixData["role"],
  requested?: MatrixStage,
) {
  if (role === "supervisor") {
    return requested === "pedido" || requested === "preparacion" || requested === "resumen"
      ? requested
      : "preparacion";
  }
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
  return ["CANT", "OBSERVACIÓN"];
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

function orderFormStatus(order: MatrixOrder) {
  if (order.deliveryStatus === "confirmado") return "Entregado";
  if (order.status === "preparado") return "Preparado · Entrega pendiente";
  if (order.status === "en_preparacion") return "En preparación";
  if (order.status === "cancelado") return "Cancelado";
  return "Pendiente";
}

function customerDividerClass(focused = false) {
  return `border-l-4 ${
    focused ? "border-l-sky-700" : "border-l-slate-700"
  }`;
}

function stageGuidance(stage: MatrixStage) {
  if (stage === "preparacion") {
    return {
      title: "Confirmación de Inventario",
      detail:
        "Registra las cantidades y el peso real preparado. Esta etapa no descuenta stock ni requiere decidir el origen de la mercadería; se confirma explícitamente durante Entrega.",
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
    | "deliveredBaseQuantity"
    | "plannedPendingBaseQuantity"
    | "plannedExternalBaseQuantity"
    | "plannedReviewBaseQuantity"
    | "deliveryWarehouseBaseQuantity"
    | "deliveryPendingBaseQuantity"
    | "deliveryExternalBaseQuantity"
    | "deliveryReviewBaseQuantity",
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

function selectedQuantityUnit(
  quantityUnits: MatrixQuantityUnit[],
  selectedUnitId: string,
  fallbackLabel: string,
) {
  return (
    quantityUnits.find((unit) => unit.id === selectedUnitId) ?? {
      id: "original",
      label: fallbackLabel,
      sourceQuantity: 1,
    }
  );
}

function aggregateLines(lines: MatrixLine[]): MatrixLine {
  const first = lines[0];
  return {
    ...first,
    requestedQuantity: sumLines(lines, "requestedQuantity"),
    requestedBaseQuantity: sumLines(lines, "requestedBaseQuantity"),
    basePerSourceQuantity: sumLines(lines, "requestedQuantity") > 0
      ? sumLines(lines, "requestedBaseQuantity") / sumLines(lines, "requestedQuantity")
      : first.basePerSourceQuantity,
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
    originPlanConfirmed: lines.every((line) => line.originPlanConfirmed),
    plannedPendingBaseQuantity: sumLines(lines, "plannedPendingBaseQuantity"),
    plannedExternalBaseQuantity: sumLines(lines, "plannedExternalBaseQuantity"),
    plannedReviewBaseQuantity: sumLines(lines, "plannedReviewBaseQuantity"),
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
    deliveryWarehouseBaseQuantity: sumLines(lines, "deliveryWarehouseBaseQuantity"),
    deliveryPendingBaseQuantity: sumLines(lines, "deliveryPendingBaseQuantity"),
    deliveryExternalBaseQuantity: sumLines(lines, "deliveryExternalBaseQuantity"),
    deliveryReviewBaseQuantity: sumLines(lines, "deliveryReviewBaseQuantity"),
    deliverySourceConfirmed: lines.every((line) => line.deliverySourceConfirmed),
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

function hasDeliveryCheck(line: MatrixLine) {
  return line.deliveryCheck;
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
        preparationDisplayUnitId: current.preparationDisplayUnitId,
        preparationCheck: current.preparationCheck,
        preparationActualWeightKg: current.preparationActualWeightKg,
        preparationNote: current.preparationNote,
        originPlanConfirmed: current.originPlanConfirmed,
        plannedPendingBaseQuantity: current.plannedPendingBaseQuantity,
        plannedExternalBaseQuantity: current.plannedExternalBaseQuantity,
        plannedReviewBaseQuantity: current.plannedReviewBaseQuantity,
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
        deliveryDisplayUnitId: current.deliveryDisplayUnitId,
        deliveryCheck: current.deliveryCheck,
        deliveryActualWeightKg: current.deliveryActualWeightKg,
        deliveryNote: current.deliveryNote,
        deliveryWarehouseBaseQuantity: current.deliveryWarehouseBaseQuantity,
        deliveryPendingBaseQuantity: current.deliveryPendingBaseQuantity,
        deliveryExternalBaseQuantity: current.deliveryExternalBaseQuantity,
        deliveryReviewBaseQuantity: current.deliveryReviewBaseQuantity,
        deliverySourceConfirmed: current.deliverySourceConfirmed,
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
  const [viewMode, setViewMode] = useState<"formulario" | "tabla">("tabla");
  const [expandedOrderId, setExpandedOrderId] = useState(initialOrderId ?? data.orders[0]?.id ?? "");
  const [deliveryOriginByOrder, setDeliveryOriginByOrder] = useState<Record<string, DeliveryOriginChoice | null>>({});
  const [selectedConfirmationOrderId, setSelectedConfirmationOrderId] = useState("");
  const [formStatus, setFormStatus] = useState<"guardado" | "pendiente" | "guardando" | "error">("guardado");
  const formSaveSequence = useRef(0);
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
  const preparationQuantityEdited = useRef(new Set<string>());
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
    setDeliveryOriginByOrder({});
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
    options: { preserveZeroPreparation?: boolean } = {},
  ) => {
    const ids = new Set(groupedLines.map((line) => line.orderItemId));
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
    if (Object.hasOwn(patch, "preparedQuantity")) {
      groupedLines.forEach((line) =>
        preparationQuantityEdited.current.add(line.orderItemId),
      );
    }
    const checkedPreparationQuantities =
      patch.preparationCheck === true &&
      !Object.hasOwn(patch, "preparedQuantity")
        ? groupedLines.map((line) =>
            preparedQuantityAfterCheck(
              line,
              true,
              options.preserveZeroPreparation ||
                preparationQuantityEdited.current.has(line.orderItemId),
            ),
          )
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
    const distributedBaseFields = new Map<string, number[]>();
    for (const field of [
      "plannedPendingBaseQuantity", "plannedExternalBaseQuantity", "plannedReviewBaseQuantity",
      "deliveryWarehouseBaseQuantity", "deliveryPendingBaseQuantity",
      "deliveryExternalBaseQuantity", "deliveryReviewBaseQuantity",
    ] as const) {
      const value = patch[field];
      if (typeof value === "number") distributedBaseFields.set(field, distributeValue(groupedLines, value));
    }
    const indexById = new Map(
      groupedLines.map((line, index) => [line.orderItemId, index]),
    );

    let anyChanged = false;
    const updatedLines = linesRef.current.map((line) => {
      if (!ids.has(line.orderItemId)) return line;
      const index = indexById.get(line.orderItemId) ?? 0;
      const next = { ...line, ...patch };
      let changed = false;
      if (
        Object.hasOwn(patch, "preparedQuantity") &&
        typeof patch.preparedQuantity === "number"
      ) {
        next.preparedQuantity = preparationQuantities[index];
        changed ||= next.preparedQuantity !== line.preparedQuantity;
      } else if (patch.preparationCheck === true) {
        next.preparedQuantity = checkedPreparationQuantities[index];
        changed ||= next.preparedQuantity !== line.preparedQuantity;
      }
      if (
        Object.hasOwn(patch, "preparedQuantity") &&
        typeof patch.preparationCheck !== "boolean"
      ) {
        next.preparationCheck = false;
      }
      if (
        patch.preparationCheck === false &&
        line.preparationCheck &&
        line.preparedQuantity <= 0.000001
      ) {
        preparationQuantityEdited.current.add(line.orderItemId);
      }
      changed ||= next.preparationCheck !== line.preparationCheck;
      if (Object.hasOwn(patch, "preparationActualWeightKg")) {
        next.preparationActualWeightKg =
          patch.preparationActualWeightKg === null
            ? null
            : preparationWeights[index];
        changed ||= next.preparationActualWeightKg !== line.preparationActualWeightKg;
      }
      if (typeof patch.deliveryCheck === "boolean") {
        next.deliveryCheck = patch.deliveryCheck;
        changed ||= next.deliveryCheck !== line.deliveryCheck;
      }
      if (
        Object.hasOwn(patch, "deliveredQuantity") &&
        typeof patch.deliveredQuantity === "number"
      ) {
        next.deliveredQuantity = deliveryQuantities[index];
        next.deliveredBaseQuantity = Number((deliveryQuantities[index] * line.basePerSourceQuantity).toFixed(6));
        if (typeof patch.deliveryCheck !== "boolean") {
          next.deliveryCheck = false;
        }
        next.deliverySourceConfirmed = false;
        next.deliveryWarehouseBaseQuantity = 0;
        next.deliveryPendingBaseQuantity = 0;
        next.deliveryExternalBaseQuantity = 0;
        next.deliveryReviewBaseQuantity = next.deliveredBaseQuantity;
        changed ||= next.deliveredQuantity !== line.deliveredQuantity ||
          next.deliveryCheck !== line.deliveryCheck ||
          line.deliverySourceConfirmed ||
          line.deliveryWarehouseBaseQuantity !== 0 ||
          line.deliveryPendingBaseQuantity !== 0 ||
          line.deliveryExternalBaseQuantity !== 0 ||
          line.deliveryReviewBaseQuantity !== next.deliveryReviewBaseQuantity;
      }
      if (Object.hasOwn(patch, "deliveryActualWeightKg")) {
        next.deliveryActualWeightKg =
          patch.deliveryActualWeightKg === null ? null : deliveryWeights[index];
        changed ||= next.deliveryActualWeightKg !== line.deliveryActualWeightKg;
      }
      for (const [field, values] of distributedBaseFields) {
        (next[field as keyof MatrixLine] as number) = values[index] ?? 0;
        changed ||= next[field as keyof MatrixLine] !== line[field as keyof MatrixLine];
      }
      for (const field of Object.keys(patch) as (keyof MatrixLine)[]) {
        changed ||= next[field] !== line[field];
      }
      if (changed) {
        anyChanged = true;
        dirty.current.add(line.orderItemId);
      }
      return next;
    });
    if (anyChanged) setFormStatus("pendiente");
    linesRef.current = updatedLines;
    setLines(updatedLines);
    if (Object.hasOwn(patch, "deliveredQuantity")) {
      const affectedOrders = new Set(updatedLines.filter((line) => ids.has(line.orderItemId)).map((line) => line.orderId));
      setDeliveryOriginByOrder((current) => {
        const next = { ...current };
        for (const orderId of affectedOrders) next[orderId] = null;
        return next;
      });
    }
  };

  const verifyZeroPreparation = (groupedLines: MatrixLine[]) => {
    updateGroupedLines(
      groupedLines,
      { preparedQuantity: 0, preparationCheck: true },
      { preserveZeroPreparation: true },
    );
  };

  const selectDeliveryOrigin = (orderId: string, choice: DeliveryOriginChoice) => {
    setDeliveryOriginByOrder((current) => ({ ...current, [orderId]: choice }));
    const orderLines = linesRef.current.filter((line) => line.orderId === orderId);
    for (const line of orderLines) {
      const quantity = expectedDeliveryBaseQuantity(line);
      updateGroupedLines([line], allocationForDeliveryOrigin(choice, quantity));
    }
  };

  const updateMixedDeliveryOrigin = (orderId: string, line: MatrixLine, patch: Partial<MatrixLine>) => {
    updateGroupedLines([line], { ...patch, deliverySourceConfirmed: false });
    setDeliveryOriginByOrder((current) => ({ ...current, [orderId]: "mixed" }));
  };

  const confirmMixedDeliveryOrigin = (orderId: string) => {
    const orderLines = linesRef.current.filter((line) => line.orderId === orderId);
    const unresolved = orderLines.find((line) => !originDistributionIsResolved({
      warehouse: line.deliveryWarehouseBaseQuantity,
      pendingToday: line.deliveryPendingBaseQuantity,
      externalDefinitive: line.deliveryExternalBaseQuantity,
      review: line.deliveryReviewBaseQuantity,
    }, expectedDeliveryBaseQuantity(line)));
    if (unresolved) {
      setMessage(`Completa el origen de ${unresolved.productName}; las cantidades deben coincidir con lo entregado y no puede quedar origen por verificar.`);
      return;
    }
    for (const line of orderLines) updateGroupedLines([line], { deliverySourceConfirmed: true });
    setDeliveryOriginByOrder((current) => ({ ...current, [orderId]: "mixed" }));
    setMessage("Distribución mixta confirmada para este pedido.");
  };

  const updateMissingDeliveryChecks = (
    groupedLines: MatrixLine[],
    checked: boolean,
  ) => {
    const changedIds = new Set(
      groupedLines
        .filter((line) => line.deliveryCheck !== checked)
        .map((line) => line.orderItemId),
    );
    if (!changedIds.size) return;
    changedIds.forEach((id) => dirty.current.add(id));
    const updatedLines = updateDeliveryChecks(
      linesRef.current,
      changedIds,
      checked,
    );
    setFormStatus("pendiente");
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
          delivered_base_quantity?: unknown;
        };
        const version = Number(response.row_version);
        if (Number.isInteger(version)) {
          const versionedLines = linesRef.current.map((line) =>
            line.orderItemId === id
              ? {
                  ...line,
                  [versionField]: Math.max(line[versionField], version),
                  ...(versionField === "deliveryVersion" && Number.isFinite(Number(response.delivered_base_quantity))
                    ? { deliveredBaseQuantity: Number(response.delivered_base_quantity) }
                    : {}),
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
          actualWeightKg: line.preparationActualWeightKg,
          displayUnitId: line.preparationDisplayUnitId,
          note: line.preparationNote,
          pendingBaseQuantity: 0,
          externalBaseQuantity: 0,
          reviewBaseQuantity: 0,
          originPlanConfirmed: false,
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
        const externalQuantity = Math.max(line.deliveredQuantity - line.preparedQuantity, 0);
        const effectiveDeliveryCheck = hasDeliveryCheck(line);
        const result = await saveMatrixDeliveryAction({
          orderItemId: line.orderItemId,
          expectedVersion: line.deliveryVersion,
          externalQuantity,
          deliveredQuantity: line.deliveredQuantity,
          deliveryCheck: effectiveDeliveryCheck,
          actualWeightKg: line.deliveryActualWeightKg,
          displayUnitId: line.deliveryDisplayUnitId,
          note:
            line.deliveryNote ||
            line.preparationNote ||
            (!line.preparedAt || !line.preparationCheck
              ? "Cantidad final registrada por Entrega."
              : ""),
          warehouseBaseQuantity: line.deliveryWarehouseBaseQuantity,
          pendingBaseQuantity: line.deliveryPendingBaseQuantity,
          externalDefinitiveBaseQuantity: line.deliveryExternalBaseQuantity,
          reviewBaseQuantity: line.deliveryReviewBaseQuantity,
          sourceOriginConfirmed: line.deliverySourceConfirmed,
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

  const actionForOrders = async (
    targetOrders: MatrixOrder[],
    label: string,
    pendingKey: string,
    action: "confirm" | "reopen",
  ) => {
    const groupOrderIds = new Set(targetOrders.map((order) => order.id));
    const groupLines = linesRef.current.filter((line) =>
      groupOrderIds.has(line.orderId),
    );
    if (action === "confirm") {
      if (targetOrders.some((order) => !deliveryOriginByOrder[order.id])) {
        setMessage("Antes de confirmar la entrega, indica de dónde salió la mercadería.");
        return;
      }
      if (groupLines.some((line) => !hasDeliveryCheck(line))) {
        setMessage(
          "Verifica el check de entrega de cada línea antes de confirmar.",
        );
        return;
      }
      const unresolvedOrigin = groupLines.find((line) => !line.deliverySourceConfirmed ||
        !originDistributionIsResolved({
          warehouse: line.deliveryWarehouseBaseQuantity,
          pendingToday: line.deliveryPendingBaseQuantity,
          externalDefinitive: line.deliveryExternalBaseQuantity,
          review: line.deliveryReviewBaseQuantity,
        }, expectedDeliveryBaseQuantity(line)));
      if (unresolvedOrigin) {
        setMessage(
          `Confirma el origen real de ${unresolvedOrigin.productName}: almacén, pendiente de ingreso hoy y externo deben sumar exactamente lo entregado; no puede quedar cantidad por revisar.`,
        );
        return;
      }
      if (
        groupLines.some(
          (line) =>
            line.preparationActualWeightKg !== null &&
            line.deliveryActualWeightKg !== null &&
            line.deliveryActualWeightKg <
              line.preparationActualWeightKg &&
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
        `¿Confirmas la entrega física de ${label}?\n\nSolo se descontará de almacén la cantidad indicada como "Desde almacén". El pendiente de ingreso hoy usará la conciliación vigente de la misma jornada. El abastecimiento externo no mueve stock.`,
      )
    ) {
      return;
    }
    setActionPending(`${pendingKey}:${action}`);
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
    const applicableOrders = actionableOrders(ordersRef.current, groupOrderIds, action);
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
        : action === "confirm"
          ? `${applicableOrders.length === 1 ? "Pedido entregado" : `${applicableOrders.length} pedidos entregados`}. Ya puedes continuar en Recibos.`
          : `${applicableOrders.length} pedido${applicableOrders.length === 1 ? "" : "s"} actualizado${applicableOrders.length === 1 ? "" : "s"}.`,
    );
    setActionPending(null);
    router.refresh();
  };
  const actionForCustomer = (group: MatrixCustomerGroup, action: "confirm" | "reopen") =>
    actionForOrders(group.orders, group.customerName, group.id, action);

  const canAdmin = data.role === "administrador";
  const visibleStages: MatrixStage[] = canAdmin
    ? ["pedido", "preparacion", "entrega", "resumen"]
    : data.role === "supervisor"
      ? ["pedido", "preparacion", "resumen"]
      : [defaultStage(data.role)];
  const headers = stageHeaders(stage);
  const guidance = stageGuidance(stage);
  const matrixColumnCount = 3 + customerGroups.length * headers.length + 1;
  const pendingDeliveryOrders = actionableOrders(orders, new Set(orders.map((order) => order.id)), "confirm");
  const selectedConfirmationOrder = pendingDeliveryOrders.find((order) => order.id === selectedConfirmationOrderId) ?? pendingDeliveryOrders[0] ?? null;
  const showForm = viewMode === "formulario";
  const saveFormLine = async (id: string) => {
    if (!dirty.current.has(id)) return true;
    const sequence = ++formSaveSequence.current;
    setFormStatus("guardando");
    try {
      const result = stage === "preparacion"
        ? (await savePreparationLine(id)).result.success
        : await saveGroupedDelivery([id]);
      if (sequence === formSaveSequence.current) setFormStatus(result ? "guardado" : "error");
      return result;
    } catch {
      if (sequence === formSaveSequence.current) setFormStatus("error");
      setMessage("No se pudo guardar. Intenta nuevamente.");
      return false;
    }
  };
  const navigateForm = async (next: () => void) => {
    if (dirty.current.size && (stage === "preparacion" || stage === "entrega")) {
      const ids = [...dirty.current];
      const saved = stage === "preparacion"
        ? await saveGroupedPreparation(ids)
        : await saveGroupedDelivery(ids);
      if (!saved) return;
    }
    next();
  };
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
              onClick={() => void navigateForm(() => {
                setStage(item);
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  url.searchParams.set("mode", item);
                  router.replace(url.pathname + url.search);
                }
              })}
              role="tab"
              aria-selected={stage === item}
              className="capitalize"
            >
              {item}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm" aria-live="polite">
          <div className="flex rounded-md border bg-white p-0.5" role="group" aria-label="Vista operativa">
            <Button size="sm" variant={showForm ? "default" : "ghost"} onClick={() => void navigateForm(() => setViewMode("formulario"))}>
              {stage === "resumen" ? "Resumen" : "Formulario"}
            </Button>
            <Button size="sm" variant={!showForm ? "default" : "ghost"} onClick={() => void navigateForm(() => setViewMode("tabla"))}>Tabla</Button>
          </div>
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
          {message && !showForm ? (
            <>
              <span className="text-muted-foreground">{message}</span>
              {message.includes("entregado") ? <Link href="/recibos" className="font-semibold text-emerald-800 underline">Ir a Recibos</Link> : null}
            </>
          ) : null}
        </div>
      </div>

      {!showForm ? <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
        <p className="font-semibold">{guidance.title}</p>
        <p className="text-sky-900">{guidance.detail}</p>
      </div> : null}

      {showForm ? (
        <section className="space-y-3" aria-label="Pedidos por cliente">
          {stage === "preparacion" ? <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">La preparación registra cantidades verificadas y no descuenta stock. El origen de la mercadería se confirma durante Entrega.</p> : null}
          {!customerGroups.length ? <p className="rounded-lg border bg-white p-6 text-sm">No hay pedidos para esta fecha.</p> : null}
          {customerGroups.map((group) => (
            <div key={group.id} className="rounded-lg border bg-white p-3 sm:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <h2 className="font-semibold">{group.customerName}</h2>
                <span className="text-xs text-muted-foreground">{group.orders.length} pedidos · {groupStatus(group)}</span>
              </div>
              <div className="space-y-2">
                {group.orders.map((order) => {
                  const orderLines = linesForOrder(lines, order.id).sort((left, right) =>
                    left.categoryName.localeCompare(right.categoryName, "es") || left.productName.localeCompare(right.productName, "es"));
                  if (!orderLines.length) return null;
                  const expanded = stage === "pedido" || stage === "resumen" || expandedOrderId === order.id;
                  const editable = stage === "preparacion"
                    ? ["pendiente_preparacion", "en_preparacion"].includes(order.status)
                    : order.deliveryStatus !== "confirmado";
                  const pending = orderLines.filter((line) => stage === "preparacion"
                    ? !line.preparationCheck : !hasDeliveryCheck(line) || !line.deliverySourceConfirmed || line.deliveryVersion === 0).length;
                  return (
                    <article key={order.id} className="rounded-md border">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2">
                        <div>
                          <h3 className="text-sm font-semibold">{order.reference}</h3>
                          <p className="text-xs text-muted-foreground">{orderLines.length} productos · {orderFormStatus(order)}
                            {stage === "preparacion" || stage === "entrega" ? " · " + pending + " pendientes" : ""}
                          </p>
                        </div>
                        {stage === "preparacion" || stage === "entrega" ? (
                          <Button size="sm" variant="outline" onClick={() => void navigateForm(() => setExpandedOrderId(expanded ? "" : order.id))}>
                            {expanded ? "Ocultar productos" : "Ver productos"}
                          </Button>
                        ) : null}
                      </div>
                      {expanded ? <div className="space-y-3 p-3">
                        {order.customerNotes ? <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">Nota: {order.customerNotes}</p> : null}
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {orderLines.map((line) => (
                            <div key={line.orderItemId} className="min-w-0 rounded-md border p-3" style={{ borderLeftColor: line.productColor ?? undefined, borderLeftWidth: 4 }}>
                              <div className="mb-2 flex items-start justify-between gap-2">
                                <div>
                                  <h4 className="text-sm font-semibold">{line.productName}</h4>
                                  <p className="text-xs text-muted-foreground">Solicitado: {formatQuantity(line.requestedQuantity)} {line.sourceLabel}</p>
                                </div>
                                {stage === "pedido" && canAdmin ? <Button size="xs" variant="outline" onClick={() => void correctGroupedRequest([line])}>Corregir</Button> : null}
                              </div>
                              {line.requestedNote ? <p className="mb-2 text-xs text-amber-800">Pedido: {line.requestedNote}</p> : null}
                              {stage === "resumen" ? (
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                  <span>Preparado<br />{formatQuantity(line.preparedQuantity)} {line.sourceLabel}</span>
                                  <span>Entregado<br />{formatQuantity(line.deliveredQuantity)} {line.sourceLabel}</span>
                                  <span>Diferencia<br />{formatQuantity(line.deliveredQuantity - line.requestedQuantity)} {line.sourceLabel}</span>
                                  {line.deliveryNote || line.preparationNote ? <p className="col-span-3 text-amber-800">{line.deliveryNote || line.preparationNote}</p> : null}
                                </div>
                              ) : null}
                              {stage === "preparacion" || stage === "entrega" ? (
                                <div className="space-y-2">
                                  {stage === "preparacion" ? <StockSplitSuggestion line={line} disabled={!editable} onAccept={(quantity) => updateGroupedLines([line], { preparedQuantity: quantity, preparationCheck: false })} /> : null}
                                  {stage === "entrega" ? <p className="rounded bg-slate-50 p-2 text-xs">
                                    Preparado: {formatQuantity(line.preparedQuantity)} {line.sourceLabel}
                                    {line.preparationActualWeightKg !== null ? " · Peso: " + formatQuantity(line.preparationActualWeightKg) + " KG" : ""}
                                  </p> : null}
                                  <MeasuredQuantityEditor
                                    key={stage + ":" + line.orderItemId}
                                    label={(stage === "preparacion" ? "Preparación" : "Entrega") + " de " + line.productName}
                                    quantityLabel={stage === "preparacion" ? "Cantidad preparada" : "Cantidad entregada"}
                                    quantityValue={stage === "preparacion" ? line.preparedQuantity : line.deliveredQuantity}
                                    quantityUnits={line.quantityUnits}
                                    selectedUnitId={stage === "preparacion" ? line.preparationDisplayUnitId : line.deliveryDisplayUnitId}
                                    actualWeightKg={stage === "preparacion" ? line.preparationActualWeightKg : line.deliveryActualWeightKg}
                                    sourceLabel={line.sourceLabel}
                                    sourceUnitHint={line.baseUnitSymbol}
                                    weightUnits={data.weightUnits}
                                    disabled={!editable}
                                    onQuantityChange={(value) => updateGroupedLines([line], stage === "preparacion" ? { preparedQuantity: value ?? 0, preparationCheck: false } : { deliveredQuantity: value ?? 0, deliverySourceConfirmed: false })}
                                    onUnitChange={(value) => updateGroupedLines([line], stage === "preparacion" ? { preparationDisplayUnitId: value } : { deliveryDisplayUnitId: value })}
                                    onWeightChange={(value) => updateGroupedLines([line], stage === "preparacion" ? { preparationActualWeightKg: value } : { deliveryActualWeightKg: value })}
                                    onBlur={() => void saveFormLine(line.orderItemId)}
                                  />
                                  <WeightPricingHint line={line} />
                                  {stage === "preparacion" ? <p className="text-xs text-muted-foreground">El origen se confirma durante Entrega.</p> : null}
                                  {stage === "preparacion" && !line.preparationCheck && line.preparedQuantity <= 0.000001 ? (
                                    <Button
                                      size="xs"
                                      type="button"
                                      variant="outline"
                                      disabled={!editable}
                                      onClick={() => {
                                        verifyZeroPreparation([line]);
                                        requestAnimationFrame(() => void saveFormLine(line.orderItemId));
                                      }}
                                    >
                                      Verificar 0 en almacén
                                    </Button>
                                  ) : null}
                                  {stage === "entrega" && line.deliveryVersion === 0 &&
                                  line.deliveredQuantity > 0 &&
                                  Math.abs(line.deliveredQuantity - line.preparedQuantity) <= 0.000001 &&
                                  !line.deliveryCheck && !line.deliveredAt ? (
                                    <p className="text-xs text-sky-800">Cantidad sugerida desde Preparación; confirma lo realmente entregado.</p>
                                  ) : null}
                                  <label className="flex items-center gap-2 text-xs font-medium">
                                    <CheckEditor
                                      label={stage === "preparacion" ? "Preparación verificada" : "Entrega física verificada"}
                                      checked={stage === "preparacion" ? line.preparationCheck : line.deliveryCheck}
                                      disabled={stage === "preparacion"
                                        ? !editable
                                        : !editable}
                                      onChange={(checked) => {
                                        if (stage === "preparacion") updateGroupedLines([line], { preparationCheck: checked });
                                        else updateMissingDeliveryChecks([line], checked);
                                      }}
                                      onBlur={() => void saveFormLine(line.orderItemId)}
                                    />
                                    {stage === "preparacion" ? "Preparación verificada" : "Entrega física verificada"}
                                  </label>
                                  <label className="block space-y-1 text-xs font-medium">Observación
                                    <NoteEditor
                                      label={"Observación de " + stage + " para " + line.productName}
                                      value={stage === "preparacion" ? line.preparationNote : line.deliveryNote}
                                      onChange={(value) => updateGroupedLines([line], stage === "preparacion" ? { preparationNote: value } : { deliveryNote: value })}
                                      onBlur={() => void saveFormLine(line.orderItemId)}
                                    />
                                  </label>
                                  {stage === "entrega" && order.deliveryStatus === "confirmado" && line.deliveryMovementId && line.deliveredBaseQuantity > 0 ? (
                                    <SameDayReconciliationControl line={line} />
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        {stage === "entrega" && order.deliveryStatus !== "confirmado" ? (
                          <DeliveryOriginControl
                            orderId={order.id}
                            lines={linesRef.current.filter((line) => line.orderId === order.id)}
                            choice={deliveryOriginByOrder[order.id] ?? null}
                            disabled={!editable || Boolean(actionPending)}
                            onChoiceChange={(choice) => selectDeliveryOrigin(order.id, choice)}
                            onMixedChange={(line, patch) => updateMixedDeliveryOrigin(order.id, line, patch)}
                            onConfirmMixed={() => confirmMixedDeliveryOrigin(order.id)}
                            message={message}
                          />
                        ) : null}
                        {stage === "preparacion" || stage === "entrega" ? (
                          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                            <span role="status" className="mr-auto text-xs text-muted-foreground">
                              {formStatus === "pendiente" ? "Sin guardar" : formStatus === "guardando" ? "Guardando..." : formStatus === "error" ? "Error al guardar" : "Guardado"}
                            </span>
                            <Button variant="outline" disabled={formStatus === "guardando" || !editable}
                              onClick={() => void (async () => {
                                const ids = orderLines.filter((line) => dirty.current.has(line.orderItemId)).map((line) => line.orderItemId);
                                if (!ids.length) return;
                                setFormStatus("guardando");
                                const success = stage === "preparacion" ? await saveGroupedPreparation(ids) : await saveGroupedDelivery(ids);
                                setFormStatus(success ? "guardado" : "error");
                              })()}>
                              Guardar {stage === "preparacion" ? "preparación" : "entrega"}
                            </Button>
                            {stage === "entrega" && actionableOrders([order], new Set([order.id]), "confirm").length ? (
                              <Button type="button" disabled={Boolean(actionPending) || formStatus === "guardando"}
                                onClick={() => void actionForOrders([order], order.customerName + " · " + order.reference, order.id, "confirm")}>
                                Confirmar entrega de este pedido
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div> : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
          {message ? <p role="status" className="text-sm text-muted-foreground">{message} {message.includes("entregado") ? <Link href="/recibos" className="font-semibold text-emerald-800 underline">Ir a Recibos</Link> : null}</p> : null}
        </section>
      ) : <>

      {!customerGroups.length ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No hay pedidos para esta fecha. Los pedidos nuevos se agregan
          automáticamente y conservan su orden.
        </div>
      ) : (
        <div
          ref={matrixScrollRef}
          className="max-h-[calc(100vh-12rem)] touch-pan-x touch-pan-y overflow-auto overscroll-contain rounded-lg border"
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
                      className={`sticky top-0 z-40 h-[86px] border-b border-r px-2 py-1.5 text-left ${customerDividerClass(focused)} ${
                        focused
                          ? "border-b-sky-500 border-r-sky-500 bg-sky-100 ring-2 ring-inset ring-sky-500"
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
                  className={`sticky top-0 z-40 min-w-40 border-b bg-emerald-100 px-3 py-2 text-left ${customerDividerClass()}`}
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
                        index === 0 ? customerDividerClass(group.id === focusedCustomerId) : ""
                      } ${
                        group.id === focusedCustomerId
                          ? "border-b-sky-400 border-r-sky-400 bg-sky-50"
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
                            onVerifyZeroPreparation={() => {
                              verifyZeroPreparation(groupedLines);
                              requestAnimationFrame(() =>
                                void saveGroupedPreparation(
                                  groupedLines.map((item) => item.orderItemId),
                                ),
                              );
                            }}
                            onSavePreparation={() =>
                              void saveGroupedPreparation(
                                groupedLines
                                  .filter((item) => dirty.current.has(item.orderItemId))
                                  .map((item) => item.orderItemId),
                              )
                            }
                            onSaveDelivery={() =>
                              void saveGroupedDelivery(
                                groupedLines
                                  .filter((item) => dirty.current.has(item.orderItemId))
                                  .map((item) => item.orderItemId),
                              )
                            }
                            onToggleMissingDeliveryCheck={(checked) =>
                              updateMissingDeliveryChecks(groupedLines, checked)
                            }
                            onSaveMissingDeliveryCheck={() =>
                              void saveGroupedDelivery(
                                groupedLines
                                  .filter((item) => dirty.current.has(item.orderItemId))
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
                            className={`border-b border-r px-2 py-1.5 text-center text-muted-foreground ${customerDividerClass(focused)} ${
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
                  // The table consolidates repeated product lines for a customer
                  // into one cell; that cell is checked only when every source
                  // line is checked.
                  const counts = summarizeVisibleProductChecks(
                    customerLines,
                    rowKey,
                    rowKey,
                    (line) => stage === "entrega"
                      ? hasDeliveryCheck(line) && line.deliverySourceConfirmed
                      : line.preparationCheck,
                  );
                  return (
                    <th
                      key={group.id}
                      colSpan={headers.length}
                      className={`sticky bottom-0 z-30 border-t border-r px-3 py-2 text-left ${customerDividerClass(group.id === focusedCustomerId)} ${
                        group.id === focusedCustomerId
                          ? "bg-sky-100"
                          : "bg-slate-100"
                      }`}
                    >
                      {counts.products} productos
                      {stage === "preparacion" || stage === "entrega"
                        ? ` · ${counts.checks} checks`
                        : ""}
                    </th>
                  );
                })}
                <th className={`sticky bottom-0 z-30 border-t bg-emerald-100 px-3 py-2 ${customerDividerClass()}`}>
                  {rows.length} productos
                </th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {!showForm && stage === "entrega" && pendingDeliveryOrders.length ? (
        <section className="rounded-lg border border-sky-200 bg-white p-3 sm:p-4" aria-label="Confirmación de origen por pedido">
          <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block space-y-1 text-sm font-medium">
              Pedido para confirmar
              <select
                className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                value={selectedConfirmationOrder?.id ?? ""}
                onChange={(event) => setSelectedConfirmationOrderId(event.target.value)}
                aria-label="Seleccionar pedido para confirmar entrega"
              >
                {pendingDeliveryOrders.map((order) => (
                  <option key={order.id} value={order.id}>{order.customerName} · {order.reference}</option>
                ))}
              </select>
            </label>
            {selectedConfirmationOrder ? <p className="text-xs text-muted-foreground">{orderFormStatus(selectedConfirmationOrder)}</p> : null}
          </div>
          {selectedConfirmationOrder ? (
            <>
              <DeliveryOriginControl
                orderId={selectedConfirmationOrder.id}
                lines={lines.filter((line) => line.orderId === selectedConfirmationOrder.id)}
                choice={deliveryOriginByOrder[selectedConfirmationOrder.id] ?? null}
                disabled={Boolean(actionPending)}
                onChoiceChange={(choice) => selectDeliveryOrigin(selectedConfirmationOrder.id, choice)}
                onMixedChange={(line, patch) => updateMixedDeliveryOrigin(selectedConfirmationOrder.id, line, patch)}
                onConfirmMixed={() => confirmMixedDeliveryOrigin(selectedConfirmationOrder.id)}
                message={message}
              />
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  disabled={Boolean(actionPending)}
                  onClick={() => void actionForOrders([selectedConfirmationOrder], selectedConfirmationOrder.customerName + " · " + selectedConfirmationOrder.reference, selectedConfirmationOrder.id, "confirm")}
                >
                  Confirmar entrega de este pedido
                </Button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
      </>}
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
  onVerifyZeroPreparation: () => void;
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
  quantityLabel = "Cantidad real",
  quantityValue,
  actualWeightKg,
  sourceLabel,
  sourceUnitHint,
  weightUnits,
  quantityUnits,
  selectedUnitId,
  onQuantityChange,
  onUnitChange,
  onWeightChange,
  onBlur,
  disabled = false,
  attention = false,
}: {
  label: string;
  quantityLabel?: string;
  quantityValue: number | null;
  actualWeightKg: number | null;
  sourceLabel: string;
  sourceUnitHint: string;
  weightUnits: MatrixWeightUnit[];
  quantityUnits: MatrixQuantityUnit[];
  selectedUnitId: string;
  onQuantityChange: (value: number | null) => void;
  onUnitChange: (value: string) => void;
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
          {quantityLabel}
        </span>
        <QuantityEditor
          label={`Cantidad comercial de ${label.toLowerCase()}`}
          value={quantityValue}
          unitLabel={sourceLabel}
          quantityUnits={quantityUnits}
          selectedUnitId={selectedUnitId}
          disabled={disabled}
          attention={attention}
          onChange={onQuantityChange}
          onUnitChange={onUnitChange}
          onBlur={onBlur}
        />
      </div>
      <div>
        <span className="mb-0.5 block text-left text-[9px] font-medium text-muted-foreground">
          Peso real (opcional)
        </span>
        <span className="mb-1 block text-left text-[9px] text-muted-foreground">
          Registra el peso medido, sin convertir cajas o unidades automáticamente.
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
        {actualWeightKg === null && sourceWeightUnit && quantityValue !== null && quantityValue > 0 ? (
          <span className="mt-1 block text-[9px] text-slate-600">
            Equivalencia configurada: {formatQuantity(quantityValue * sourceWeightUnit.kilograms)} kg (estimación; no es peso medido).
          </span>
        ) : null}
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
  const preparedUnit = selectedQuantityUnit(
    line.quantityUnits,
    line.preparationDisplayUnitId,
    line.sourceLabel,
  );
  const preparedQuantity = quantityInSelectedUnit(
    line.preparedQuantity,
    preparedUnit,
  );

  return (
    <div
      className="min-w-32 rounded-md border border-slate-300 bg-slate-50/80 px-2 py-1.5 text-left"
      aria-label={`Preparado por Inventario para ${line.productName}`}
    >
      <span className="block text-[9px] font-medium text-muted-foreground">
        Cantidad preparada
      </span>
      <span className="block font-semibold">
        {formatQuantity(preparedQuantity ?? 0)} {preparedUnit.label}
      </span>
      {line.controlsActualWeight || line.preparationActualWeightKg !== null ? (
        <>
          <span className="mt-1 block text-[9px] font-medium text-muted-foreground">
            Peso preparado
          </span>
          <span className="block font-semibold">
            {displayWeight === null || !displayUnit
              ? "Sin registrar"
              : `${formatQuantity(displayWeight)} ${displayUnit.symbol || displayUnit.name}`}
          </span>
        </>
      ) : null}
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
  quantityUnits,
  selectedUnitId,
  onChange,
  onUnitChange,
  onBlur,
  disabled = false,
  attention = false,
}: {
  label: string;
  value: number | null;
  unitLabel: string;
  quantityUnits: MatrixQuantityUnit[];
  selectedUnitId: string;
  onChange: (value: number | null) => void;
  onUnitChange: (value: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  attention?: boolean;
}) {
  const selectedUnit = selectedQuantityUnit(
    quantityUnits,
    selectedUnitId,
    unitLabel,
  );
  return (
    <div className="min-w-36">
      <div className="flex items-center gap-1">
        <DecimalInput
          label={label}
          value={quantityInSelectedUnit(value, selectedUnit)}
          disabled={disabled}
          attention={attention}
          onChange={(nextValue) => onChange(quantityInOriginalUnit(nextValue, selectedUnit))}
          onBlur={onBlur}
        />
        <select
          aria-label={`Unidad de ${label.toLowerCase()}`}
          title="La unidad elegida queda guardada para preparación o entrega."
          className="h-7 max-w-28 rounded-md border border-input bg-background px-1 text-[11px] font-semibold uppercase"
          value={selectedUnit.id}
          disabled={disabled}
          onChange={(event) => onUnitChange(event.target.value)}
          onBlur={onBlur}
        >
          {quantityUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>{unit.label}</option>
          ))}
        </select>
      </div>
      {selectedUnit.id !== "original" ? (
        <span className="mt-1 block text-[9px] text-muted-foreground">
          Equivale a {formatQuantity(value ?? 0)} {unitLabel} del pedido
        </span>
      ) : null}
      {quantityUnits.length < 2 ? (
        <span className="mt-1 block text-[9px] text-muted-foreground">
          Sin otras equivalencias configuradas para este producto.
        </span>
      ) : null}
    </div>
  );
}

function StockSplitSuggestion({ line, disabled, onAccept }: {
  line: MatrixLine;
  disabled: boolean;
  onAccept: (warehouseQuantity: number) => void;
}) {
  const suggestion = suggestWarehouseSplit(line);
  if (!suggestion) return null;
  return (
    <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-left text-xs text-amber-950">
      <p>Existencia informativa: {formatQuantity(suggestion.availableBase)} {line.baseUnitSymbol}.</p>
      <p>Sugerencia para {formatQuantity(line.requestedQuantity)} {line.sourceLabel}: almacén {formatQuantity(suggestion.warehouseQuantity)} y externo {formatQuantity(suggestion.externalQuantity)} {line.sourceLabel}.</p>
      <p>Confirma el origen real. La existencia se revisará otra vez al confirmar la entrega.</p>
      <Button type="button" size="xs" variant="outline" disabled={disabled} className="mt-1" onClick={() => {
        if (window.confirm(`¿Confirmas que ${formatQuantity(suggestion.warehouseQuantity)} ${line.sourceLabel} saldrán del almacén? Los ${formatQuantity(suggestion.externalQuantity)} ${line.sourceLabel} restantes deberán abastecerse externamente.`)) {
          onAccept(suggestion.warehouseQuantity);
        }
      }}>
        Aceptar sugerencia
      </Button>
    </div>
  );
}

function DeliveryOriginControl({
  orderId,
  lines,
  choice,
  disabled,
  onChoiceChange,
  onMixedChange,
  onConfirmMixed,
  message,
}: {
  orderId: string;
  lines: MatrixLine[];
  choice: DeliveryOriginChoice | null;
  disabled: boolean;
  onChoiceChange: (choice: DeliveryOriginChoice) => void;
  onMixedChange: (line: MatrixLine, patch: Partial<MatrixLine>) => void;
  onConfirmMixed: () => void;
  message: string | null;
}) {
  const descriptions: Record<DeliveryOriginChoice, string> = {
    warehouse: "Todos los productos entregados en este pedido salen del almacén. Al confirmar, se descuenta únicamente la cantidad realmente entregada, después de verificar existencias.",
    pending: "La mercadería se entregó físicamente, pero su ingreso al almacén todavía no está registrado. El sistema la concilia con ingresos físicos confirmados durante esa misma jornada, sin permitir saldos negativos.",
    external: "La mercadería se compró directamente por fuera para ese cliente. Se registra la entrega normalmente, sin descontar inventario.",
    mixed: "Indica el origen real de cada producto. Las cantidades deben coincidir con lo entregado y no puede quedar una parte por verificar.",
  };
  const isMissingSelection = !choice && message === "Antes de confirmar la entrega, indica de dónde salió la mercadería.";
  const orderLines = lines.filter((line) => line.orderId === orderId);
  const unresolvedMixed = orderLines.some((line) => !originDistributionIsResolved({
    warehouse: line.deliveryWarehouseBaseQuantity,
    pendingToday: line.deliveryPendingBaseQuantity,
    externalDefinitive: line.deliveryExternalBaseQuantity,
    review: line.deliveryReviewBaseQuantity,
  }, expectedDeliveryBaseQuantity(line)));
  return (
    <fieldset className={`rounded-lg border p-3 ${isMissingSelection ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-slate-50"}`} aria-invalid={isMissingSelection}>
      <legend className="px-1 text-sm font-semibold text-slate-900">Origen de la mercadería · este pedido</legend>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block space-y-1 text-sm font-medium">
          Origen de entrega
          <select
            className="h-10 w-full rounded-md border bg-white px-3 text-sm"
            value={choice && choice !== "mixed" ? choice : ""}
            disabled={disabled}
            aria-label={`Origen de mercadería del pedido ${orderId}`}
            aria-invalid={isMissingSelection}
            onChange={(event) => {
              const value = event.target.value as DeliveryOriginChoice | "";
              if (value) onChoiceChange(value);
            }}
          >
            <option value="">Selecciona el origen real</option>
            <option value="warehouse">Desde almacén</option>
            <option value="pending">Ingreso pendiente de hoy</option>
            <option value="external">Venta externa</option>
          </select>
        </label>
        <Button type="button" size="sm" variant={choice === "mixed" ? "default" : "outline"} disabled={disabled} onClick={() => onChoiceChange("mixed")}>
          Origen mixto
        </Button>
      </div>
      {choice ? <p className="mt-2 text-xs leading-5 text-slate-700">{descriptions[choice]}</p> : <p className="mt-2 text-xs text-muted-foreground">Selecciona el origen comprobado antes de confirmar. No se asignará automáticamente.</p>}
      {choice === "mixed" ? (
        <div className="mt-3 space-y-3 border-t pt-3">
          {orderLines.map((line) => (
            <OriginSplitEditor key={line.orderItemId} line={line} disabled={disabled || Boolean(line.deliveredAt)} onChange={(patch) => onMixedChange(line, patch)} />
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-700">La distribución se guarda por producto, dentro de este pedido.</p>
            <Button type="button" size="sm" variant="outline" disabled={disabled || unresolvedMixed} onClick={onConfirmMixed}>
              Confirmar distribución mixta
            </Button>
          </div>
        </div>
      ) : null}
      {isMissingSelection ? <p role="alert" className="mt-2 text-sm font-medium text-rose-800">Selecciona el origen real para poder confirmar.</p> : null}
    </fieldset>
  );
}

function OriginSplitEditor({ line, disabled, onChange }: {
  line: MatrixLine;
  disabled: boolean;
  onChange: (patch: Partial<MatrixLine>) => void;
}) {
  const components = [
    { key: "warehouse", label: "Desde almacén", base: line.deliveryWarehouseBaseQuantity },
    { key: "pending", label: "Ingreso pendiente de hoy", base: line.deliveryPendingBaseQuantity },
    { key: "external", label: "Venta externa", base: line.deliveryExternalBaseQuantity },
    { key: "review", label: "Origen por verificar", base: line.deliveryReviewBaseQuantity },
  ];
  const origin = {
    warehouse: line.deliveryWarehouseBaseQuantity,
    pendingToday: line.deliveryPendingBaseQuantity,
    externalDefinitive: line.deliveryExternalBaseQuantity,
    review: line.deliveryReviewBaseQuantity,
  };
  const total = originDistributionTotal(origin);
  const expected = expectedDeliveryBaseQuantity(line);
  const matches = originDistributionMatches(origin, expected);

  const update = (key: string, value: number | null) => {
    const normalizedValue = Math.max(value ?? 0, 0);
    const baseValue = Number(normalizedValue.toFixed(6));
    const field = key === "warehouse" ? "deliveryWarehouseBaseQuantity"
      : key === "pending" ? "deliveryPendingBaseQuantity"
      : key === "external" ? "deliveryExternalBaseQuantity"
      : "deliveryReviewBaseQuantity";
    onChange({ [field]: baseValue, deliverySourceConfirmed: false });
  };

  return (
    <fieldset className="rounded-md border border-sky-200 bg-sky-50/70 p-2 text-left">
      <legend className="px-1 text-xs font-semibold text-sky-950">{line.productName} · {formatQuantity(expected)} {line.baseUnitSymbol}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {components.map((item) => (
          <label key={item.key} className="block space-y-1 text-xs font-medium leading-4 text-slate-800">
            <span className="block">{item.label} ({line.baseUnitSymbol})</span>
            <DecimalInput
              label={`${item.label} de ${line.productName}`}
              value={item.base}
              disabled={disabled}
              attention={false}
              onChange={(value) => update(item.key, value)}
              onBlur={() => undefined}
            />
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px]">
        <span className="font-semibold">Distribuido: {formatQuantity(total)} / {formatQuantity(expected)} {line.baseUnitSymbol}</span>
        <span className={matches ? "text-emerald-800" : "font-semibold text-amber-800"}>
          {matches ? "Las cantidades coinciden" : "Completa la distribución; no se asignará un origen automáticamente"}
        </span>
      </div>
      {line.deliveryReviewBaseQuantity > 0.000001 ? (
        <p className="mt-1 text-[10px] font-semibold text-amber-900">Resuelve la cantidad por verificar antes de confirmar la entrega.</p>
      ) : null}
    </fieldset>
  );
}

function expectedDeliveryBaseQuantity(line: MatrixLine) {
  return line.deliveredBaseQuantity > 0
    ? line.deliveredBaseQuantity
    : line.deliveredQuantity * line.basePerSourceQuantity;
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
    onVerifyZeroPreparation,
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
          className={`${cellClass} ${customerDividerClass(focused)} font-semibold`}
        >
          {formatQuantity(line.requestedQuantity)}
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
    return (
      <>
        <td style={cellStyle} className={`${cellClass} ${customerDividerClass(focused)}`}>
          <span className="font-semibold">
            {formatQuantity(line.requestedQuantity)}
          </span>
        </td>
        <td style={cellStyle} className={cellClass}>
          <div className="flex flex-col items-center gap-1">
            <CheckEditor
              label={`Preparación verificada ${line.productName}`}
              checked={line.preparationCheck}
              disabled={!editable}
              onChange={(checked) => onChange({ preparationCheck: checked })}
              onBlur={onSavePreparation}
            />
            {!line.preparationCheck && line.preparedQuantity <= 0.000001 ? (
              <Button
                size="xs"
                type="button"
                variant="outline"
                disabled={!editable}
                aria-label={`Verificar cero preparado desde almacén para ${line.productName}`}
                onClick={onVerifyZeroPreparation}
              >
                Verificar 0
              </Button>
            ) : null}
          </div>
        </td>
        <td style={cellStyle} className={cellClass}>
          <MeasuredQuantityEditor
            label={`Peso real preparado de ${line.productName}`}
            quantityValue={line.preparedQuantity}
            quantityUnits={line.quantityUnits}
            selectedUnitId={line.preparationDisplayUnitId}
            actualWeightKg={line.preparationActualWeightKg}
            sourceLabel={line.sourceLabel}
            sourceUnitHint={line.baseUnitSymbol}
            weightUnits={weightUnits}
            disabled={!editable}
            attention={!line.preparedAt}
            onQuantityChange={(value) =>
              onChange({
                preparedQuantity: value ?? 0,
                preparationCheck: false,
              })
            }
            onUnitChange={(value) =>
              onChange({ preparationDisplayUnitId: value })
            }
            onWeightChange={(value) =>
              onChange({
                preparationActualWeightKg: value,
              })
            }
            onBlur={onSavePreparation}
          />
          <WeightPricingHint line={line} />
          <StockSplitSuggestion line={line} disabled={!editable} onAccept={(quantity) => onChange({ preparedQuantity: quantity, preparationCheck: false })} />
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
      !line.preparationCheck &&
      !line.deliveredAt &&
      line.deliveryVersion === 0;
    const lowerThanPrepared =
      line.preparationActualWeightKg !== null &&
      line.deliveryActualWeightKg !== null &&
      line.deliveryActualWeightKg <
        line.preparationActualWeightKg;
    const noteMissingForShortfall =
      lowerThanPrepared && line.deliveryNote.trim().length < 3;
    const deliveryDisabled = !editable;
    return (
      <>
        <td style={cellStyle} className={`${cellClass} ${customerDividerClass(focused)}`}>
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
            disabled={deliveryDisabled}
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
          <MeasuredQuantityEditor
            label={`Peso real entrega ${line.productName}`}
            quantityValue={line.deliveredQuantity}
            quantityUnits={line.quantityUnits}
            selectedUnitId={line.deliveryDisplayUnitId}
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
            onUnitChange={(value) =>
              onChange({ deliveryDisplayUnitId: value })
            }
            onWeightChange={(value) =>
              onChange({
                deliveryActualWeightKg: value,
              })
            }
            onBlur={onSaveDelivery}
          />
          {stage === "entrega" && line.deliveryMovementId && line.deliveredBaseQuantity > 0 ? (
            <SameDayReconciliationControl line={line} />
          ) : null}
          <WeightPricingHint line={line} />
          {deliveryReady && line.deliveryVersion === 0 && line.deliveredQuantity > 0 &&
          Math.abs(line.deliveredQuantity - line.preparedQuantity) <= 0.000001 &&
          !line.deliveryCheck && !line.deliveredAt ? (
            <span className="mt-1 block text-[9px] font-medium text-sky-800">
              Sugerido por Preparación · confirma lo realmente entregado
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
      <td style={cellStyle} className={`${cellClass} ${customerDividerClass(focused)}`}>
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
        {line.deliveryActualWeightKg !== null
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
      className={`border-b px-3 py-1.5 align-top text-[11px] ${customerDividerClass()}`}
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

function SameDayReconciliationControl({ line }: { line: MatrixLine }) {
  const router = useRouter();
  const [classification, setClassification] = useState<"pending" | "external_definitive" | "review">("pending");
  const [pendingQuantity, setPendingQuantity] = useState(line.externalBaseQuantity);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const current = line.reconciliation;
  const canResolvePending = current?.classification === "pending" && current.reconciledQuantity === 0;

  if (line.deliverySourceConfirmed) {
    const statusLabel = current?.status === "partial"
      ? "Conciliación parcial"
      : current?.status === "reconciled"
        ? "Conciliado"
        : current?.status === "pending"
          ? "Pendiente de ingreso de hoy"
          : current?.status === "external_definitive"
            ? "Externo definitivo"
            : current?.status === "review"
              ? "Revisión"
              : "Sin componente externo";
    return <div className="mt-2 rounded-md border border-slate-200 bg-white/80 p-2 text-left text-[10px]" aria-live="polite">
      <p className="font-semibold">Origen físico confirmado · {statusLabel}</p>
      <p>Almacén {formatQuantity(line.deliveryWarehouseBaseQuantity)} {line.baseUnitSymbol}
        {` · Pendiente hoy ${formatQuantity(line.deliveryPendingBaseQuantity)} ${line.baseUnitSymbol}`}
        {` · Externo ${formatQuantity(line.deliveryExternalBaseQuantity)} ${line.baseUnitSymbol}`}</p>
      {current?.classification === "pending" ? <p>Conciliado {formatQuantity(current.reconciledQuantity)} / {formatQuantity(current.pendingQuantity)} {line.baseUnitSymbol}.</p> : null}
    </div>;
  }

  async function submit(nextClassification: "pending" | "external_definitive" | "review") {
    if (!line.deliveryMovementId) return;
    setBusy(true);
    setMessage("");
    const result = await classifySameDayDeliverySourceAction({
      deliveryMovementId: line.deliveryMovementId,
      classification: nextClassification,
      pendingQuantity: nextClassification === "pending" ? pendingQuantity : 0,
      note,
      idempotencyKey: idempotencyKey("reconciliation"),
    });
    setBusy(false);
    setMessage(result.message);
    if (result.success) router.refresh();
  }

  if (current && !canResolvePending) {
    const statusLabel = current.status === "partial"
      ? "Pendiente parcial"
      : current.status === "reconciled"
        ? "Conciliado"
        : current.status === "external_definitive"
          ? "Externo definitivo"
          : "Revisión manual";
    return <div className="mt-2 rounded-md border border-slate-200 bg-white/80 p-2 text-left text-[10px]" aria-live="polite">
      <p className="font-semibold">Origen: {statusLabel}</p>
      {current.classification === "pending" ? <p>Conciliado {formatQuantity(current.reconciledQuantity)} / {formatQuantity(current.pendingQuantity)} {line.baseUnitSymbol} · Pendiente {formatQuantity(Math.max(current.pendingQuantity-current.reconciledQuantity,0))} {line.baseUnitSymbol}</p> : null}
      {current.classification === "pending" && current.reconciledQuantity > 0 ? <p className="mt-1 text-amber-800">Esta entrega ya afectó stock; se requiere una corrección auditada para reabrirla.</p> : null}
    </div>;
  }

  return <div className="mt-2 space-y-2 rounded-md border border-amber-200 bg-amber-50/70 p-2 text-left text-[10px]">
    <p className="font-semibold text-amber-950">Origen de {formatQuantity(line.externalBaseQuantity)} {line.baseUnitSymbol} externos</p>
    <p className="text-amber-900">Clasifica el origen real. Solo la cantidad pendiente de almacén puede descontarse con una compra confirmada en esta misma jornada. El resto queda externo definitivo.</p>
    <label className="block space-y-1"><span>Clasificación</span>
      <select value={classification} onChange={(event) => setClassification(event.target.value as typeof classification)} className="h-9 w-full rounded-md border bg-white px-2 text-xs">
        <option value="pending">Pendiente de compra de almacén hoy</option>
        <option value="external_definitive">Abastecimiento externo definitivo</option>
        <option value="review">Origen incierto · revisión administrativa</option>
      </select>
    </label>
    {classification === "pending" ? <label className="block space-y-1"><span>Cantidad externa pendiente ({line.baseUnitSymbol})</span>
      <Input type="number" min="0.001" max={line.externalBaseQuantity} step="0.001" value={pendingQuantity} onChange={(event) => setPendingQuantity(Number(event.target.value))} className="h-9 bg-white text-xs" />
    </label> : null}
    <label className="block space-y-1"><span>Motivo / confirmación del origen físico</span>
      <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Ej.: queda pendiente de compra para esta jornada" className="h-9 bg-white text-xs" />
    </label>
    <div className="flex flex-wrap gap-1">
      <Button type="button" size="sm" disabled={busy || note.trim().length < 3 || (classification === "pending" && !(pendingQuantity > 0 && pendingQuantity <= line.externalBaseQuantity))} onClick={() => void submit(classification)}>
        {busy ? "Guardando…" : current ? "Guardar clasificación" : "Confirmar origen"}
      </Button>
      {canResolvePending ? <Button type="button" size="sm" variant="outline" disabled={busy || note.trim().length < 3} onClick={() => void submit("review")}>Enviar a revisión</Button> : null}
    </div>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
