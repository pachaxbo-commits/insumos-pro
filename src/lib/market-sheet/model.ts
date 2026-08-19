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

export type MarketSheetRow = {
  key: string;
  category: string;
  productName: string;
  productColor: string | null;
  unit: string;
  quantities: number[];
  total: number;
};

export type MarketSheetModel = {
  operationalDate: string;
  customers: MarketSheetCustomer[];
  rows: MarketSheetRow[];
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
  return `${line.productId}:${line.sourceLabel}`;
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
        quantities[customerIndex] += line.requestedQuantity;
      }
      return {
        key,
        category: first.categoryName,
        productName: first.productName,
        productColor: first.productColor,
        unit: first.sourceLabel,
        quantities: quantities.map((value) => Number(value.toFixed(6))),
        total: Number(
          quantities.reduce((sum, value) => sum + value, 0).toFixed(6),
        ),
      } satisfies MarketSheetRow;
    })
    .sort(
      (left, right) =>
        left.category.localeCompare(right.category, "es") ||
        left.productName.localeCompare(right.productName, "es") ||
        left.unit.localeCompare(right.unit, "es"),
    );

  return { operationalDate: data.operationalDate, customers, rows };
}

