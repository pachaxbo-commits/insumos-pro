import type {
  MatrixLine,
  MatrixOrder,
  OperationalMatrixData,
} from "@/types/operational-matrix";

export type MarketSheetCustomer = {
  key: string;
  name: string;
  location: string | null;
  orderIds: string[];
};

export type MarketSheetLineRef = {
  orderItemId: string;
  orderId: string;
  preparationVersion: number;
  requestedQuantity: number;
  requestedUnitLabel: string;
  requestedBaseQuantity: number;
  pendingBaseQuantity: number | null;
  /** Quantity shown in the delivery-selected unit only when its snapshot is verifiable. */
  deliveredQuantity: number;
  deliveredDisplayQuantity: number;
  deliveredUnitLabel: string;
  deliveredDisplayWarning: string | null;
  deliveredBaseQuantity: number;
  deliveredWeightValue: number | null;
  deliveredWeightUnitSymbol: string | null;
  deliveredWeightKg: number | null;
  conversionValid: boolean;
  baseUnitId: string;
  inventoryBaseUnitId: string | null;
  preparationDisplayUnitId: string;
  quantityUnits: MatrixLine["quantityUnits"];
  actualWeightKg: number | null;
  actualWeightValue: number | null;
  actualWeightUnitSymbol: string | null;
  preparedQuantity: number;
  preparationCheck: boolean;
  preparationNote: string;
  originPlanConfirmed: boolean;
  plannedPendingBaseQuantity: number;
  plannedExternalBaseQuantity: number;
  plannedReviewBaseQuantity: number;
  provisionCostUnit: number | null;
};

export type MarketSheetCostUnit = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  kilograms: number;
};

export type MarketSheetRow = {
  key: string;
  productId: string;
  category: string;
  productName: string;
  stockCurrent: number;
  stockAvailable: number | null;
  toProvision: number | null;
  isCoveredByStock: boolean | null;
  unitReviewRequired: boolean;
  productColor: string | null;
  unit: string;
  /** Original commercial quantities in each customer's original units. */
  quantities: number[];
  /** Base-unit aggregates; null means a stored conversion cannot be trusted. */
  requestedQuantities: Array<number | null>;
  deliveredQuantities: Array<number | null>;
  pendingQuantities: Array<number | null>;
  customerLines: MarketSheetLineRef[][];
  requestedTotal: number | null;
  deliveredTotal: number | null;
  pendingTotal: number | null;
  /** Backwards-compatible name for requestedTotal. */
  total: number | null;
  /** Stock reserved for remaining, undelivered quantities. */
  reserved: number | null;
  controlsActualWeight: boolean;
  actualWeightOrQuantity: number | null;
  baseSalePrice: number | null;
  provisionCostUnit: number | null;
  baseUnitKgFactor: number | null;
  basePriceUnitId: string | null;
  priceUnitSymbol: string | null;
  lines: MarketSheetLineRef[];
};

export type MarketSheetModel = {
  operationalDate: string;
  customers: MarketSheetCustomer[];
  rows: MarketSheetRow[];
  totalLineCount: number;
  customerLineCounts: number[];
  costReferenceUnits: MarketSheetCostUnit[];
};

export function costPerBaseUnitFromReference(
  costPerReferenceUnit: number,
  referenceUnitFactor: number,
  baseUnitFactor: number,
) {
  if (![costPerReferenceUnit, referenceUnitFactor, baseUnitFactor].every(Number.isFinite) ||
    costPerReferenceUnit < 0 || referenceUnitFactor <= 0 || baseUnitFactor <= 0) return null;
  return Number((costPerReferenceUnit * baseUnitFactor / referenceUnitFactor).toFixed(8));
}

export function costPerReferenceUnitFromBase(
  costPerBaseUnit: number,
  referenceUnitFactor: number,
  baseUnitFactor: number,
) {
  if (![costPerBaseUnit, referenceUnitFactor, baseUnitFactor].every(Number.isFinite) ||
    costPerBaseUnit < 0 || referenceUnitFactor <= 0 || baseUnitFactor <= 0) return null;
  return Number((costPerBaseUnit * referenceUnitFactor / baseUnitFactor).toFixed(8));
}

function uniqueText(values: Array<string | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))].join(
    ", ",
  );
}

function buildCustomers(orders: MatrixOrder[]) {
  const grouped = new Map<
    string,
    { orders: MatrixOrder[]; firstPosition: number }
  >();

  for (const order of orders) {
    const current = grouped.get(order.customerKey);
    if (current) {
      current.orders.push(order);
      current.firstPosition = Math.min(current.firstPosition, order.position);
      continue;
    }
    grouped.set(order.customerKey, {
      orders: [order],
      firstPosition: order.position,
    });
  }

  return [...grouped.entries()]
    .sort((left, right) => left[1].firstPosition - right[1].firstPosition)
    .map(([key, group]) => ({
      key,
      name: group.orders[0]?.customerName ?? "Cliente",
      location:
        uniqueText(group.orders.map((order) => order.locationLabel)) || null,
      orderIds: group.orders.map((order) => order.id),
    }));
}

function baseUnitKey(line: MatrixLine) {
  return line.baseUnitId?.trim() || `symbol:${line.baseUnitSymbol.trim().toLocaleLowerCase("es")}`;
}

function displayUnitLabel(line: MatrixLine, unitId: string, fallback: string) {
  if (!unitId || unitId === "original") return fallback;
  return line.quantityUnits?.find((unit) => unit.id === unitId)?.label ?? fallback;
}

function resolveDeliveredDisplay(line: MatrixLine) {
  const original = {
    quantity: line.deliveredQuantity,
    unitLabel: line.sourceLabel,
    warning: null as string | null,
  };
  const selectedUnitId = line.deliveryDisplayUnitId;
  if (!selectedUnitId || selectedUnitId === "original") return original;

  const selectedUnit = line.quantityUnits.find((unit) => unit.id === selectedUnitId);
  const basePerSource = line.requestedQuantity > 0
    ? line.requestedBaseQuantity / line.requestedQuantity
    : 0;
  // Actual-weight items keep commercial delivery quantity and measured weight
  // separate. Their base quantity can represent a pricing weight, not a unit
  // conversion of the delivered commercial quantity.
  if (!selectedUnit || line.controlsActualWeight || !line.requestedConversionValid ||
    !(selectedUnit.sourceQuantity > 0) || !(basePerSource > 0) ||
    !Number.isFinite(selectedUnit.sourceQuantity) || !Number.isFinite(basePerSource)) {
    return {
      ...original,
      warning: `No se pudo verificar la conversión a ${displayUnitLabel(line, selectedUnitId, selectedUnitId)}; se conserva la cantidad comercial original.`,
    };
  }

  const tolerance = Math.max(0.00001, Math.abs(line.deliveredBaseQuantity) * 0.000001);
  const sourceBaseQuantity = line.deliveredQuantity * basePerSource;
  const selectedBasePerUnit = selectedUnit.sourceQuantity * basePerSource;
  const isSelectedBaseUnit = selectedUnitId === `unit:${line.baseUnitId}`;
  if (!Number.isFinite(sourceBaseQuantity) ||
    Math.abs(sourceBaseQuantity - line.deliveredBaseQuantity) > tolerance ||
    !Number.isFinite(selectedBasePerUnit) || selectedBasePerUnit <= 0 ||
    (isSelectedBaseUnit && Math.abs(selectedBasePerUnit - 1) > 0.000001)) {
    return {
      ...original,
      warning: `La equivalencia a ${selectedUnit.label} no coincide con el snapshot físico; se conserva la cantidad comercial original.`,
    };
  }

  const displayQuantity = Number((line.deliveredBaseQuantity / selectedBasePerUnit).toFixed(6));
  if (!Number.isFinite(displayQuantity)) return original;

  return {
    quantity: displayQuantity,
    unitLabel: selectedUnit.label,
    warning: null,
  };
}

function roundQuantity(value: number) {
  return Number(value.toFixed(6));
}

export function baseQuantityAsRequestedUnit(
  baseQuantity: number,
  requestedQuantity: number,
  requestedBaseQuantity: number,
) {
  if (
    ![baseQuantity, requestedQuantity, requestedBaseQuantity].every(Number.isFinite) ||
    baseQuantity < 0 || requestedQuantity < 0 || requestedBaseQuantity <= 0
  ) return null;
  return Number((baseQuantity * requestedQuantity / requestedBaseQuantity).toFixed(4));
}

export function buildMarketSheetModel(
  data: OperationalMatrixData,
): MarketSheetModel {
  const costReferenceUnits = data.weightUnits.filter((unit) => unit.kilograms > 0);
  const customers = buildCustomers(
    data.orders.filter((order) => order.status !== "cancelado"),
  );
  const customerIndexByOrder = new Map<string, number>();
  customers.forEach((customer, customerIndex) => {
    customer.orderIds.forEach((orderId) => {
      customerIndexByOrder.set(orderId, customerIndex);
    });
  });

  const rowGroups = new Map<string, MatrixLine[]>();
  for (const line of data.lines) {
    if (!customerIndexByOrder.has(line.orderId)) continue;
    // A product can have historical requests with different base-unit IDs.
    // Keep those records visible in separate rows; the model below refuses to
    // compare either row against the same stock balance until the unit conflict
    // is resolved instead of adding incompatible quantities or double-using stock.
    const key = `${line.productId}::${baseUnitKey(line)}`;
    rowGroups.set(key, [...(rowGroups.get(key) ?? []), line]);
  }

  const groupsPerProduct = new Map<string, number>();
  for (const lines of rowGroups.values()) {
    const productId = lines[0]?.productId;
    if (productId) groupsPerProduct.set(productId, (groupsPerProduct.get(productId) ?? 0) + 1);
  }

  const rows = [...rowGroups.entries()]
    .map(([key, lines]) => {
      const first = lines[0];
      const quantities = customers.map(() => 0);
      const requestedByCustomer = customers.map(() => 0);
      const deliveredByCustomer = customers.map(() => 0);
      const pendingByCustomer = customers.map(() => 0);
      const conversionKnownByCustomer = customers.map(() => true);
      for (const line of lines) {
        const customerIndex = customerIndexByOrder.get(line.orderId);
        if (customerIndex === undefined) continue;
        quantities[customerIndex] += line.requestedQuantity;
        if (line.requestedConversionValid === false) {
          conversionKnownByCustomer[customerIndex] = false;
          continue;
        }
        const requested = Math.max(line.requestedBaseQuantity, 0);
        const delivered = Math.max(line.deliveredBaseQuantity, 0);
        requestedByCustomer[customerIndex] += requested;
        deliveredByCustomer[customerIndex] += delivered;
        pendingByCustomer[customerIndex] += Math.max(requested - delivered, 0);
      }
      const requestedQuantities = requestedByCustomer.map((value, index) =>
        conversionKnownByCustomer[index] ? roundQuantity(value) : null);
      const deliveredQuantities = deliveredByCustomer.map((value, index) =>
        conversionKnownByCustomer[index] ? roundQuantity(value) : null);
      const pendingQuantities = pendingByCustomer.map((value, index) =>
        conversionKnownByCustomer[index] ? roundQuantity(value) : null);
      const allConversionsValid = lines.every((line) => line.requestedConversionValid !== false);
      const requestedTotal = allConversionsValid
        ? roundQuantity(requestedByCustomer.reduce((sum, value) => sum + value, 0))
        : null;
      const deliveredTotal = allConversionsValid
        ? roundQuantity(deliveredByCustomer.reduce((sum, value) => sum + value, 0))
        : null;
      const pendingTotal = allConversionsValid
        ? roundQuantity(pendingByCustomer.reduce((sum, value) => sum + value, 0))
        : null;
      const inventoryUnitMismatch = lines.some((line) =>
        !line.inventoryBaseUnitId || line.inventoryBaseUnitId !== baseUnitKey(line),
      );
      const unitReviewRequired = (groupsPerProduct.get(first.productId) ?? 0) > 1 ||
        !allConversionsValid || inventoryUnitMismatch;
      const stockCurrent = Number(first.stockCurrent.toFixed(6));
      const stockAvailable = unitReviewRequired ? null : stockCurrent;
      const toProvision = unitReviewRequired || pendingTotal === null
        ? null
        : roundQuantity(Math.max(pendingTotal - stockCurrent, 0));
      const isCoveredByStock = toProvision === null ? null : toProvision === 0;

      // Real weight or quantity entered in preparation
      const controlsActualWeight = Boolean(first.controlsActualWeight);
      let actualWeightOrQuantity: number | null = null;
      if (controlsActualWeight) {
        const hasWeights = lines.some(
          (l) => l.preparationActualWeightKg !== null,
        );
        if (hasWeights) {
          actualWeightOrQuantity = roundQuantity(
            lines
              .reduce(
                (sum, l) => sum + (l.preparationActualWeightKg ?? 0),
                0,
              )
          );
        }
      } else {
        const hasPrepared = lines.some(
          (l) => l.preparationCheck || l.preparedQuantity > 0,
        );
        if (hasPrepared) {
          actualWeightOrQuantity = roundQuantity(lines.reduce(
            (sum, l) => sum + (l.preparedBaseQuantity ?? 0), 0,
          ));
        }
      }

      const lineRefs: MarketSheetLineRef[] = lines.map((l) => {
        const deliveredDisplay = resolveDeliveredDisplay(l);
        return {
          orderItemId: l.orderItemId,
          orderId: l.orderId,
          preparationVersion: l.preparationVersion,
          requestedQuantity: l.requestedQuantity,
          requestedUnitLabel: l.sourceLabel,
          requestedBaseQuantity: l.requestedBaseQuantity,
          pendingBaseQuantity: l.requestedConversionValid !== false
            ? roundQuantity(Math.max(l.requestedBaseQuantity - l.deliveredBaseQuantity, 0))
            : null,
          deliveredQuantity: l.deliveredQuantity,
          deliveredDisplayQuantity: deliveredDisplay.quantity,
          deliveredUnitLabel: deliveredDisplay.unitLabel,
          deliveredDisplayWarning: deliveredDisplay.warning,
          deliveredBaseQuantity: l.deliveredBaseQuantity,
          deliveredWeightValue: l.deliveryActualWeightValue,
          deliveredWeightUnitSymbol: l.deliveryActualWeightUnitSymbol,
          deliveredWeightKg: l.deliveryActualWeightKg,
          conversionValid: l.requestedConversionValid !== false,
          baseUnitId: baseUnitKey(l),
          inventoryBaseUnitId: l.inventoryBaseUnitId ?? null,
          preparationDisplayUnitId: l.preparationDisplayUnitId,
          quantityUnits: l.quantityUnits,
          actualWeightKg: l.preparationActualWeightKg,
          actualWeightValue: l.preparationActualWeightValue,
          actualWeightUnitSymbol: l.preparationActualWeightUnitSymbol,
          preparedQuantity: l.preparedQuantity,
          preparationCheck: l.preparationCheck,
          preparationNote: l.preparationNote,
          originPlanConfirmed: l.originPlanConfirmed,
          plannedPendingBaseQuantity: l.plannedPendingBaseQuantity,
          plannedExternalBaseQuantity: l.plannedExternalBaseQuantity,
          plannedReviewBaseQuantity: l.plannedReviewBaseQuantity,
          provisionCostUnit: l.provisionCostUnit,
        };
      });
      const customerLines = customers.map((customer) => lineRefs.filter((line) =>
        customer.orderIds.includes(line.orderId),
      ));

      const provisionCostUnit =
        lines.find((l) => l.provisionCostUnit !== null)?.provisionCostUnit ?? null;
      const normalizedBaseUnit = first.baseUnitSymbol.trim().toLocaleLowerCase("es");
      const baseUnitKgFactor = costReferenceUnits.find((unit) => unit.id === first.baseUnitId)?.kilograms
        ?? (first.baseUnitId ? null : costReferenceUnits.find((unit) =>
          [unit.code, unit.name, unit.symbol].some((label) => label.trim().toLocaleLowerCase("es") === normalizedBaseUnit),
        )?.kilograms ?? null);

      return {
        key,
        productId: first.productId,
        category: first.categoryName,
        productName: first.productName,
        stockCurrent,
        stockAvailable,
        toProvision,
        isCoveredByStock,
        unitReviewRequired,
        productColor: first.productColor,
        unit: first.baseUnitSymbol,
        quantities: quantities.map(roundQuantity),
        requestedQuantities,
        deliveredQuantities,
        pendingQuantities,
        customerLines,
        requestedTotal,
        deliveredTotal,
        pendingTotal,
        total: requestedTotal,
        reserved: pendingTotal,
        controlsActualWeight,
        actualWeightOrQuantity: unitReviewRequired ? null : actualWeightOrQuantity,
        baseSalePrice: first.baseSalePrice,
        provisionCostUnit,
        baseUnitKgFactor,
        basePriceUnitId: first.basePriceUnitId,
        priceUnitSymbol: first.priceUnitSymbol ?? first.baseUnitSymbol,
        lines: lineRefs,
      } satisfies MarketSheetRow;
    })
    .sort(
      (left, right) =>
        left.category.localeCompare(right.category, "es") ||
        left.productName.localeCompare(right.productName, "es") ||
        left.unit.localeCompare(right.unit, "es"),
    );

  const customerLineCounts = customers.map(
    (_, index) => rows.filter((row) => row.quantities[index] > 0).length,
  );

  return {
    operationalDate: data.operationalDate,
    customers,
    rows,
    totalLineCount: customerLineCounts.reduce((sum, count) => sum + count, 0),
    customerLineCounts,
    costReferenceUnits,
  };
}
