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
  actualWeightKg: number | null;
  preparedQuantity: number;
  preparationCheck: boolean;
  provisionCostUnit: number | null;
};

export type MarketSheetRow = {
  key: string;
  productId: string;
  category: string;
  productName: string;
  stockCurrent: number;
  stockAvailable: number;
  toProvision: number;
  isCoveredByStock: boolean;
  productColor: string | null;
  unit: string;
  quantities: number[];
  total: number;
  reserved: number;
  controlsActualWeight: boolean;
  actualWeightOrQuantity: number | null;
  baseSalePrice: number | null;
  provisionCostUnit: number | null;
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
};

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

function lineKey(line: MatrixLine) {
  return line.productId;
}

function pendingQuantity(line: MatrixLine) {
  return Math.max(line.requestedBaseQuantity - line.deliveredBaseQuantity, 0);
}

export function buildMarketSheetModel(
  data: OperationalMatrixData,
): MarketSheetModel {
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
    const key = lineKey(line);
    rowGroups.set(key, [...(rowGroups.get(key) ?? []), line]);
  }

  const rows = [...rowGroups.entries()]
    .map(([key, lines]) => {
      const first = lines[0];
      const quantities = customers.map(() => 0);
      for (const line of lines) {
        const customerIndex = customerIndexByOrder.get(line.orderId);
        if (customerIndex === undefined) continue;
        quantities[customerIndex] += pendingQuantity(line);
      }
      const total = Number(
        quantities.reduce((sum, value) => sum + value, 0).toFixed(6),
      );
      const stockCurrent = Number(first.stockCurrent.toFixed(6));
      const stockAvailable = stockCurrent;
      const toProvision = Number(Math.max(total - stockAvailable, 0).toFixed(6));
      const isCoveredByStock = total <= stockAvailable;

      // Real weight or quantity entered in preparation
      const controlsActualWeight = Boolean(first.controlsActualWeight);
      let actualWeightOrQuantity: number | null = null;
      if (controlsActualWeight) {
        const hasWeights = lines.some(
          (l) => l.preparationActualWeightKg !== null,
        );
        if (hasWeights) {
          actualWeightOrQuantity = Number(
            lines
              .reduce(
                (sum, l) => sum + (l.preparationActualWeightKg ?? 0),
                0,
              )
              .toFixed(6),
          );
        }
      } else {
        const hasPrepared = lines.some(
          (l) => l.preparationCheck || l.preparedQuantity > 0,
        );
        if (hasPrepared) {
          actualWeightOrQuantity = Number(
            lines
              .reduce((sum, l) => sum + (l.preparedQuantity ?? 0), 0)
              .toFixed(6),
          );
        }
      }

      const lineRefs: MarketSheetLineRef[] = lines.map((l) => ({
        orderItemId: l.orderItemId,
        orderId: l.orderId,
        preparationVersion: l.preparationVersion,
        requestedQuantity: l.requestedQuantity,
        actualWeightKg: l.preparationActualWeightKg,
        preparedQuantity: l.preparedQuantity,
        preparationCheck: l.preparationCheck,
        provisionCostUnit: l.provisionCostUnit,
      }));

      const provisionCostUnit =
        lines.find((l) => l.provisionCostUnit !== null)?.provisionCostUnit ?? null;

      return {
        key,
        productId: first.productId,
        category: first.categoryName,
        productName: first.productName,
        stockCurrent,
        stockAvailable,
        toProvision,
        isCoveredByStock,
        productColor: first.productColor,
        unit: first.baseUnitSymbol,
        quantities: quantities.map((value) => Number(value.toFixed(6))),
        total,
        reserved: total,
        controlsActualWeight,
        actualWeightOrQuantity,
        baseSalePrice: first.baseSalePrice,
        provisionCostUnit,
        basePriceUnitId: first.basePriceUnitId,
        priceUnitSymbol: first.priceUnitSymbol ?? first.baseUnitSymbol,
        lines: lineRefs,
      } satisfies MarketSheetRow;
    })
    .filter((row) => row.total > 0)
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
  };
}
