export type OrderDraftLine = {
  productId: string;
  allowedUnitId: string;
  quantity: string;
  notes: string;
  orderItemId?: string;
  expectedVersion?: number;
};

export function serializeOrderItems(lines: OrderDraftLine[]) {
  return JSON.stringify(lines.map((line) => ({
    productId: line.productId,
    inputMode: "quantity",
    allowedUnitId: line.allowedUnitId || null,
    quantity: line.quantity.trim() ? Number(line.quantity) : null,
    notes: line.notes,
    ...(line.orderItemId ? { orderItemId: line.orderItemId } : {}),
    ...(line.expectedVersion !== undefined
      ? { expectedVersion: line.expectedVersion }
      : {}),
  })));
}
