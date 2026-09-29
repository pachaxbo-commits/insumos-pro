import Decimal from "decimal.js";

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
