export function suggestWarehouseSplit(input: {
  requestedQuantity: number;
  requestedBaseQuantity: number;
  stockCurrent: number;
}) {
  const { requestedQuantity, requestedBaseQuantity, stockCurrent } = input;
  if (
    !Number.isFinite(requestedQuantity) || requestedQuantity <= 0 ||
    !Number.isFinite(requestedBaseQuantity) || requestedBaseQuantity <= 0 ||
    !Number.isFinite(stockCurrent)
  ) return null;

  const availableBase = Math.max(0, stockCurrent);
  if (requestedBaseQuantity <= availableBase + 0.000001) return null;
  const warehouseQuantity = Math.floor(
    Math.min(requestedQuantity, availableBase * requestedQuantity / requestedBaseQuantity) * 1000 + 0.000001,
  ) / 1000;
  return {
    availableBase,
    warehouseQuantity,
    externalQuantity: Number((requestedQuantity - warehouseQuantity).toFixed(3)),
  };
}
