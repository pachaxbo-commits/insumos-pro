export type HistoryLine = {
  productId: string;
  productName: string;
  unit: string;
  requested: number;
  prepared: number;
  delivered: number;
};

export type HistoryOrder = {
  id: string;
  date: string;
  reference: string;
  customerId: string;
  customerName: string;
  status: string;
  lines: HistoryLine[];
  receipts: { id: string; number: string; status: string }[];
};

export function summarizeHistory(orders: HistoryOrder[]) {
  const customers = new Map<string, { name: string; orders: number }>();
  const requestedProducts = new Map<string, { name: string; lines: number }>();
  const deliveredProducts = new Map<string, { name: string; lines: number }>();
  for (const order of orders) {
    const customer = customers.get(order.customerId) ?? { name: order.customerName, orders: 0 };
    customer.orders += 1;
    customers.set(order.customerId, customer);
    for (const line of order.lines) {
      const requested = requestedProducts.get(line.productId) ?? { name: line.productName, lines: 0 };
      requested.lines += 1;
      requestedProducts.set(line.productId, requested);
      if (line.delivered > 0) {
        const delivered = deliveredProducts.get(line.productId) ?? { name: line.productName, lines: 0 };
        delivered.lines += 1;
        deliveredProducts.set(line.productId, delivered);
      }
    }
  }
  return {
    orderCount: orders.length,
    deliveredOrderCount: orders.filter((order) => ["entregado_pendiente_recibo", "recibo_emitido"].includes(order.status)).length,
    customerRanking: [...customers.values()].sort((a, b) => b.orders - a.orders),
    requestedProductRanking: [...requestedProducts.values()].sort((a, b) => b.lines - a.lines),
    deliveredProductRanking: [...deliveredProducts.values()].sort((a, b) => b.lines - a.lines),
  };
}
