import type { MatrixLine } from "@/types/operational-matrix";

export type PreparationStockCapacity = {
  known: boolean;
  availableBaseQuantity: number | null;
  allocatedBaseQuantity: number | null;
  reason: string | null;
};

/**
 * Allocate the visible stock once across active order lines for a product.
 * A capacity is unknown when stock and the order snapshot use different base
 * units or any line has an unverifiable physical conversion.
 */
export function preparationStockCapacityByLine(
  lines: MatrixLine[],
  activeOrderIds: ReadonlySet<string>,
): Map<string, PreparationStockCapacity> {
  const byProduct = new Map<string, MatrixLine[]>();
  for (const line of lines) {
    if (!activeOrderIds.has(line.orderId)) continue;
    byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line]);
  }

  const result = new Map<string, PreparationStockCapacity>();
  for (const productLines of byProduct.values()) {
    const first = productLines[0];
    const stocks = productLines.map((line) => line.stockCurrent);
    const stockIsConsistent = stocks.every((stock) =>
      Number.isFinite(stock) && Math.abs(stock - first.stockCurrent) <= 0.000001,
    );
    const dimensionsMatch = productLines.every((line) =>
      line.inventoryBaseUnitId !== null &&
      line.inventoryBaseUnitId === line.baseUnitId &&
      line.requestedConversionValid,
    );

    if (!stockIsConsistent || !dimensionsMatch) {
      const reason = !stockIsConsistent
        ? "La existencia mostrada no coincide entre líneas del producto."
        : "La unidad física del pedido no coincide con la unidad de inventario o su equivalencia no es verificable.";
      for (const line of productLines) {
        result.set(line.orderItemId, {
          known: false,
          availableBaseQuantity: null,
          allocatedBaseQuantity: null,
          reason,
        });
      }
      continue;
    }

    let remaining = Math.max(0, first.stockCurrent);
    for (const line of productLines) {
      const requested = Math.max(0, line.requestedBaseQuantity);
      const allocated = Math.min(requested, remaining);
      remaining = Math.max(0, remaining - allocated);
      result.set(line.orderItemId, {
        known: true,
        availableBaseQuantity: Math.max(0, first.stockCurrent),
        allocatedBaseQuantity: allocated,
        reason: null,
      });
    }
  }
  return result;
}

export function preparationPlanQuantities(input: {
  requestedBaseQuantity: number;
  preparedBaseQuantity: number;
  pendingBaseQuantity: number;
  externalBaseQuantity: number;
  capacity: PreparationStockCapacity;
}) {
  const requested = Math.max(0, input.requestedBaseQuantity);
  const prepared = Math.max(0, input.preparedBaseQuantity);
  const missing = Math.max(0, requested - prepared);
  const pending = Math.max(0, input.pendingBaseQuantity);
  const external = Math.max(0, input.externalBaseQuantity);
  const resolved = Math.abs(pending + external - missing) <= 0.00001;
  const exceedsAvailable = input.capacity.known &&
    prepared > (input.capacity.allocatedBaseQuantity ?? 0) + 0.00001;

  return {
    missingBaseQuantity: missing,
    pendingBaseQuantity: pending,
    externalBaseQuantity: external,
    remainingToClassifyBaseQuantity: Math.max(0, missing - pending - external),
    resolved,
    exceedsAvailable,
    canConfirm: input.capacity.known && !exceedsAvailable && resolved,
  };
}
