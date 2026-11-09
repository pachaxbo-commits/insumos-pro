import Decimal from "decimal.js";

export type CostBasis = "commercial_unit" | "actual_weight";
export type CostCalculation = {
  status: "ready" | "pending_weight" | "pending_quantity" | "invalid_reference";
  referenceQuantity: string | null;
  totalCost: string | null;
  averageCostPerDeliveredBaseUnit: string | null;
};

/** Mirrors the snapshot arithmetic enforced by the receipt-line trigger. */
export function calculateConfiguredCost(input: {
  basis: CostBasis;
  rateAmount: Decimal.Value;
  commercialQuantity?: Decimal.Value | null;
  actualWeightKg?: Decimal.Value | null;
  referenceUnitFactorToKg?: Decimal.Value | null;
  deliveredBaseQuantity: Decimal.Value;
}): CostCalculation {
  const rate = new Decimal(input.rateAmount);
  const deliveredQuantity = new Decimal(input.deliveredBaseQuantity);
  if (!rate.isFinite() || !rate.isPositive()) throw new Error("La tarifa debe ser positiva.");
  if (!deliveredQuantity.isFinite() || deliveredQuantity.isNegative()) throw new Error("La cantidad entregada no es válida.");

  let referenceQuantity: Decimal;
  if (input.basis === "commercial_unit") {
    if (input.commercialQuantity === null || input.commercialQuantity === undefined) {
      return { status: "pending_quantity", referenceQuantity: null, totalCost: null, averageCostPerDeliveredBaseUnit: null };
    }
    referenceQuantity = new Decimal(input.commercialQuantity);
  } else {
    if (input.actualWeightKg === null || input.actualWeightKg === undefined || new Decimal(input.actualWeightKg).isZero()) {
      return { status: "pending_weight", referenceQuantity: null, totalCost: null, averageCostPerDeliveredBaseUnit: null };
    }
    if (input.referenceUnitFactorToKg === null || input.referenceUnitFactorToKg === undefined) {
      return { status: "invalid_reference", referenceQuantity: null, totalCost: null, averageCostPerDeliveredBaseUnit: null };
    }
    const factor = new Decimal(input.referenceUnitFactorToKg);
    if (!factor.isFinite() || !factor.isPositive()) {
      return { status: "invalid_reference", referenceQuantity: null, totalCost: null, averageCostPerDeliveredBaseUnit: null };
    }
    referenceQuantity = new Decimal(input.actualWeightKg).div(factor).toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  }
  if (!referenceQuantity.isFinite() || !referenceQuantity.isPositive()) {
    return { status: "pending_quantity", referenceQuantity: null, totalCost: null, averageCostPerDeliveredBaseUnit: null };
  }
  const total = referenceQuantity.times(rate).toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  return {
    status: "ready",
    referenceQuantity: referenceQuantity.toFixed(8),
    totalCost: total.toFixed(8),
    averageCostPerDeliveredBaseUnit: deliveredQuantity.isPositive()
      ? total.div(deliveredQuantity).toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8)
      : null,
  };
}

/** Sale calculation remains tied to the catalog sale snapshot, never to cost. */
export function calculateIndependentSale(input: {
  quantity: Decimal.Value;
  baseUnitPrice: Decimal.Value;
  factorsPercent: Decimal.Value[];
}) {
  const quantity = new Decimal(input.quantity);
  const base = new Decimal(input.baseUnitPrice);
  const factors = Decimal.sum(...input.factorsPercent.map((value) => new Decimal(value)));
  if (![quantity, base, factors].every((value) => value.isFinite())
    || quantity.isNegative() || base.isNegative() || factors.isNegative()) {
    throw new Error("La cantidad, el precio o el factor no es válido.");
  }
  const unitSale = base.times(new Decimal(1).plus(factors.div(100)))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const saleTotalPrecise = quantity.times(unitSale).toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  return { unitSale: unitSale.toFixed(4), saleTotalPrecise: saleTotalPrecise.toFixed(8), factorTotalPercent: factors.toString() };
}
