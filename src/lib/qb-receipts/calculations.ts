export function receiptFactorTotal(factors: number[]) {
  return factors.reduce((total, factor) => total + factor, 0);
}

export function receiptUnitPrice(basePrice: number, factors: number[]) {
  return Number((basePrice * (1 + receiptFactorTotal(factors) / 100)).toFixed(4));
}

export function receiptLineTotal(
  quantity: number,
  basePrice: number,
  factors: number[],
) {
  return Number((quantity * receiptUnitPrice(basePrice, factors)).toFixed(2));
}

export function receiptTotals(
  lines: Array<{ quantity: number; basePrice: number }>,
  factors: number[],
) {
  const subtotal = Number(
    lines.reduce((total, line) => total + line.quantity * line.basePrice, 0).toFixed(2),
  );
  const total = Number(
    lines.reduce(
      (sum, line) => sum + receiptLineTotal(line.quantity, line.basePrice, factors),
      0,
    ).toFixed(2),
  );
  return { subtotal, surcharge: Number((total - subtotal).toFixed(2)), total };
}
