export type CostReferenceUnit = {
  dimensionId: string;
  conversionFactorToBase: number;
};

export function resolveWeightUnitFactor(
  unit: CostReferenceUnit | null | undefined,
  weightDimensionId: string | undefined,
) {
  if (!unit || !weightDimensionId || unit.dimensionId !== weightDimensionId) return null;
  return Number.isFinite(unit.conversionFactorToBase) && unit.conversionFactorToBase > 0
    ? unit.conversionFactorToBase
    : null;
}

/** Convert a price stated per reference unit to price per target unit only
 * when both units belong to the same verified physical dimension. */
export function normalizeReferenceCost(
  pricePerReferenceUnit: number,
  reference: CostReferenceUnit | null | undefined,
  target: CostReferenceUnit | null | undefined,
) {
  if (!Number.isFinite(pricePerReferenceUnit) || pricePerReferenceUnit < 0
    || !reference || !target || reference.dimensionId !== target.dimensionId
    || !Number.isFinite(reference.conversionFactorToBase) || reference.conversionFactorToBase <= 0
    || !Number.isFinite(target.conversionFactorToBase) || target.conversionFactorToBase <= 0) {
    return null;
  }
  return Number((pricePerReferenceUnit * target.conversionFactorToBase
    / reference.conversionFactorToBase).toFixed(8));
}
