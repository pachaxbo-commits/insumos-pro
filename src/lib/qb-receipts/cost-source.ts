import Decimal from "decimal.js";

export type FifoLotConsumptionInput = {
  quantityConsumed: Decimal.Value;
  unitCost: Decimal.Value | null;
  costStatus: "known" | "historical_unknown";
};

export type FifoReceiptLineCostResult =
  | {
      status: "ready";
      source: "fifo";
      costTotal: string;
      costBaseUnit: string;
      knownQuantity: string;
      unknownQuantity: string;
    }
  | {
      status: "no_stock" | "pending_unknown_cost";
      source: null;
      costTotal: null;
      costBaseUnit: null;
      knownQuantity: string;
      unknownQuantity: string;
    };

/** Compute weighted FIFO line cost solely from verified lot consumptions without inventing unknown costs. */
export function calculateFifoReceiptLineCost(input: {
  deliveredQuantity: Decimal.Value;
  warehouseQuantity: Decimal.Value;
  unreconciledExternalQuantity?: Decimal.Value;
  consumptions: readonly FifoLotConsumptionInput[];
}): FifoReceiptLineCostResult {
  const delivered = new Decimal(input.deliveredQuantity);
  const warehouse = new Decimal(input.warehouseQuantity);
  const external = new Decimal(input.unreconciledExternalQuantity ?? 0);
  if (!delivered.isFinite() || delivered.lte(0)) throw new Error("Cantidad entregada inválida");
  if (!warehouse.isFinite() || warehouse.isNegative()) throw new Error("Cantidad de bodega inválida");
  if (!external.isFinite() || external.isNegative()) throw new Error("Cantidad externa inválida");

  let knownQty = new Decimal(0);
  let knownCost = new Decimal(0);
  let unknownQty = new Decimal(0);

  for (const consumption of input.consumptions) {
    const qty = new Decimal(consumption.quantityConsumed);
    if (!qty.isFinite() || qty.lte(0)) throw new Error("Cantidad consumida inválida");
    const rate = consumption.unitCost === null ? null : new Decimal(consumption.unitCost);
    if (consumption.costStatus !== "known" || rate === null || !rate.isFinite() || rate.lte(0)) {
      unknownQty = unknownQty.plus(qty);
    } else {
      knownQty = knownQty.plus(qty);
      knownCost = knownCost.plus(qty.times(rate).toDecimalPlaces(8, Decimal.ROUND_HALF_UP));
    }
  }

  if (warehouse.isZero()) {
    return {
      status: "no_stock",
      source: null,
      costTotal: null,
      costBaseUnit: null,
      knownQuantity: knownQty.toFixed(8),
      unknownQuantity: unknownQty.toFixed(8),
    };
  }

  if (
    unknownQty.gt(0)
    || external.gt("0.000001")
    || knownQty.minus(warehouse).abs().gt("0.000001")
    || knownCost.lte(0)
  ) {
    return {
      status: "pending_unknown_cost",
      source: null,
      costTotal: null,
      costBaseUnit: null,
      knownQuantity: knownQty.toFixed(8),
      unknownQuantity: unknownQty.toFixed(8),
    };
  }

  const costTotal = knownCost.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  const costBaseUnit = costTotal.div(delivered).toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  return {
    status: "ready",
    source: "fifo",
    costTotal: costTotal.toFixed(8),
    costBaseUnit: costBaseUnit.toFixed(8),
    knownQuantity: knownQty.toFixed(8),
    unknownQuantity: "0.00000000",
  };
}

// The source may later be a FIFO allocation. Receipts only consume its effective
// total and freeze the corresponding unit cost; they never choose inventory lots.
export function resolveReceiptCostSnapshot(input: {
  deliveredQuantity: Decimal.Value;
  purchaseCostTotal?: Decimal.Value | null;
  effectiveCostTotal?: Decimal.Value | null;
}) {
  const quantity = new Decimal(input.deliveredQuantity);
  if (!quantity.isFinite() || !quantity.greaterThan(0)) throw new Error("Cantidad entregada inválida");
  const totalInput = input.effectiveCostTotal ?? input.purchaseCostTotal;
  if (totalInput === null || totalInput === undefined) return null;
  const total = new Decimal(totalInput);
  if (!total.isFinite() || total.isNegative()) throw new Error("Costo total inválido");
  return {
    source: input.effectiveCostTotal === null || input.effectiveCostTotal === undefined
      ? "purchase_snapshot" as const : "fifo" as const,
    costTotal: total.toFixed(8),
    costBaseUnit: total.div(quantity).toFixed(8),
  };
}
