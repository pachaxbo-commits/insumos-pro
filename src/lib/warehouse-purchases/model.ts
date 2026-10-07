export function purchaseTotal(quantity: number, unitPrice: number) {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error("Cantidad o PU compra inválido.");
  }
  return Math.round(quantity * unitPrice * 10_000) / 10_000;
}

export type ReferenceUnit = { dimensionId: string; factorToBase: number };

export function referenceCostForUnit(
  manualReferencePrice: number,
  referenceUnit: ReferenceUnit,
  receiptBaseUnit: ReferenceUnit,
) {
  if (!Number.isFinite(manualReferencePrice) || manualReferencePrice < 0 ||
    referenceUnit.dimensionId !== receiptBaseUnit.dimensionId ||
    !Number.isFinite(referenceUnit.factorToBase) || referenceUnit.factorToBase <= 0 ||
    !Number.isFinite(receiptBaseUnit.factorToBase) || receiptBaseUnit.factorToBase <= 0) {
    return null;
  }
  return Math.round(manualReferencePrice * receiptBaseUnit.factorToBase /
    referenceUnit.factorToBase * 100_000_000) / 100_000_000;
}
