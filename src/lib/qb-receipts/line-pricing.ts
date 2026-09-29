import Decimal from "decimal.js";

export type LineFactors = {
  distance: Decimal.Value;
  exigency: Decimal.Value;
  weather: Decimal.Value;
  extraordinary: Decimal.Value;
};

export type LinePricingInput = {
  quantity: Decimal.Value;
  costBaseUnit: Decimal.Value;
  factors: LineFactors;
  fixedSaleTotal?: Decimal.Value | null;
};

const precision = 8;

function nonnegative(value: Decimal.Value, label: string) {
  const decimal = new Decimal(value);
  if (!decimal.isFinite() || decimal.isNegative()) throw new Error(`${label} inválido`);
  return decimal;
}

export function calculateReceiptLine(input: LinePricingInput) {
  const quantity = nonnegative(input.quantity, "Cantidad");
  const costBaseUnit = nonnegative(input.costBaseUnit, "Costo");
  const factors = Object.values(input.factors).map((value) => nonnegative(value, "Factor"));
  if (factors.some((factor) => factor.greaterThan(1000))) throw new Error("Factor fuera de rango");
  const factorTotalPct = Decimal.sum(...factors);
  const costTotal = quantity.times(costBaseUnit);
  const saleTotal = input.fixedSaleTotal === null || input.fixedSaleTotal === undefined
    ? costTotal.times(new Decimal(1).plus(factorTotalPct.div(100)))
    : nonnegative(input.fixedSaleTotal, "Venta fija");
  const unitProfit = quantity.isZero() ? new Decimal(0)
    : saleTotal.minus(costTotal).div(quantity);
  const unitSale = quantity.isZero() ? new Decimal(0) : saleTotal.div(quantity);
  return {
    factorTotalPct: factorTotalPct.toString(),
    costBaseUnit: costBaseUnit.toFixed(precision),
    unitProfit: unitProfit.toFixed(precision),
    unitSale: unitSale.toFixed(precision),
    costTotal: costTotal.toFixed(precision),
    saleTotal: saleTotal.toFixed(precision),
    profitTotal: saleTotal.minus(costTotal).toFixed(precision),
  };
}

export type ReceiptAmounts = { costTotal: Decimal.Value; saleTotal: Decimal.Value };

export function sumReceiptAmounts(lines: ReceiptAmounts[]) {
  const costTotal = lines.reduce((sum, line) => sum.plus(line.costTotal), new Decimal(0));
  const saleTotal = lines.reduce((sum, line) => sum.plus(line.saleTotal), new Decimal(0));
  const profitTotal = saleTotal.minus(costTotal);
  return {
    costTotal: costTotal.toFixed(precision),
    saleTotal: saleTotal.toFixed(precision),
    profitTotal: profitTotal.toFixed(precision),
    marginPercent: saleTotal.isZero() ? "0" : profitTotal.div(saleTotal).times(100).toString(),
  };
}

export function summarizeReceipts<T extends { customerId: string; date: string; status: string;
  costTotal: Decimal.Value; saleTotal: Decimal.Value }>(
  receipts: T[],
  filter: { customerId?: string; startDate?: string; endDate?: string; year?: number; month?: number } = {},
) {
  const selected = receipts.filter((receipt) => {
    if (receipt.status !== "emitido") return false;
    if (filter.customerId && receipt.customerId !== filter.customerId) return false;
    if (filter.startDate && receipt.date < filter.startDate) return false;
    if (filter.endDate && receipt.date > filter.endDate) return false;
    if (filter.year && Number(receipt.date.slice(0, 4)) !== filter.year) return false;
    if (filter.month && Number(receipt.date.slice(5, 7)) !== filter.month) return false;
    return true;
  });
  const byCustomer = new Map<string, T[]>();
  for (const receipt of selected) byCustomer.set(receipt.customerId,
    [...(byCustomer.get(receipt.customerId) ?? []), receipt]);
  return {
    selected,
    customers: [...byCustomer].map(([customerId, items]) => ({
      customerId, count: items.length, ...sumReceiptAmounts(items),
    })),
    total: sumReceiptAmounts(selected),
  };
}
