export type OrderDraftLine = {
  productId: string;
  allowedUnitId: string;
  quantity: string;
  notes: string;
};

export function serializeOrderItems(lines: OrderDraftLine[]) {
  return JSON.stringify(lines.map((line) => ({
    productId: line.productId,
    inputMode: "quantity",
    allowedUnitId: line.allowedUnitId || null,
    quantity: line.quantity.trim() ? Number(line.quantity) : null,
    notes: line.notes,
  })));
}
