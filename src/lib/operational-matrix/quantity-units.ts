import type { MatrixQuantityUnit } from "../../types/operational-matrix.ts";

type Unit = {
  id: string;
  dimension_id: string;
  symbol: string;
  name: string;
  conversion_factor_to_base: number;
  is_active: boolean;
};
type Presentation = {
  id: string;
  product_id: string;
  base_unit_id: string;
  symbol: string;
  name: string;
  conversion_factor_to_base: number;
  is_active: boolean;
};

export function resolveRequestedBasePerSourceQuantity(
  requestedQuantity: number,
  requestedBaseQuantity: number,
  conversionFactorSnapshot: number,
) {
  if (!(requestedQuantity > 0) || !(requestedBaseQuantity > 0) ||
    !(conversionFactorSnapshot > 0) ||
    ![requestedQuantity, requestedBaseQuantity, conversionFactorSnapshot].every(Number.isFinite)) {
    return { basePerSourceQuantity: 0, valid: false };
  }

  // The saved base quantity is the immutable result of the original order.
  // Keep that snapshot authoritative; never replace missing data with factor 1.
  const basePerSourceQuantity = requestedBaseQuantity / requestedQuantity;
  const tolerance = Math.max(0.000001, Math.abs(conversionFactorSnapshot) * 0.000001);
  return {
    basePerSourceQuantity,
    valid: Math.abs(basePerSourceQuantity - conversionFactorSnapshot) <= tolerance,
  };
}

export function hasPhysicalOrderBasis(
  base: Unit | undefined,
  source: Unit | undefined,
  presentationId: string | null,
  physicalDimensionIds: readonly string[],
  snapshot?: { sourceLabel: string; factor: number },
) {
  if (!base) return false;
  if (!physicalDimensionIds.includes(base.dimension_id)) {
    // Identity is meaningful even for a legacy label. It permits no conversion
    // to another unit, and stock allocation still requires the same unit ID.
    return presentationId === null && source?.id === base.id && snapshot?.factor === 1 &&
      snapshot.sourceLabel.trim().toLocaleLowerCase("es") === base.symbol.trim().toLocaleLowerCase("es");
  }
  // A product presentation has its own immutable order snapshot.
  return presentationId !== null || source?.dimension_id === base.dimension_id;
}

export function quantityUnitOptions(
  item: {
    product_id: string;
    base_unit_id: string;
    source_unit_id: string | null;
    product_presentation_id: string | null;
    source_label: string;
    conversion_factor_to_base: number;
  },
  units: Unit[],
  presentations: Presentation[],
  physicalDimensionIds: string[] = [...new Set(units.map((unit) => unit.dimension_id))],
): MatrixQuantityUnit[] {
  const options = [{ id: "original", label: item.source_label, sourceQuantity: 1 }];
  const base = units.find((unit) => unit.id === item.base_unit_id);
  if (!hasPhysicalOrderBasis(base, units.find((unit) => unit.id === item.source_unit_id),
    item.product_presentation_id, physicalDimensionIds)) return options;
  const originalFactor = Number(item.conversion_factor_to_base);
  if (!base || !(originalFactor > 0) || !Number.isFinite(originalFactor)) return options;
  const baseFactor = Number(base.conversion_factor_to_base);
  if (!(baseFactor > 0) || !Number.isFinite(baseFactor)) return options;

  for (const unit of units) {
    if (!unit.is_active || unit.dimension_id !== base.dimension_id || unit.id === item.source_unit_id) continue;
    const sourceQuantity = Number(unit.conversion_factor_to_base) / baseFactor / originalFactor;
    if (sourceQuantity > 0 && Number.isFinite(sourceQuantity)) {
      options.push({ id: `unit:${unit.id}`, label: unit.symbol || unit.name, sourceQuantity });
    }
  }
  for (const presentation of presentations) {
    if (!presentation.is_active || presentation.product_id !== item.product_id ||
      presentation.base_unit_id !== item.base_unit_id || presentation.id === item.product_presentation_id) continue;
    const sourceQuantity = Number(presentation.conversion_factor_to_base) / originalFactor;
    if (sourceQuantity > 0 && Number.isFinite(sourceQuantity)) {
      options.push({ id: `presentation:${presentation.id}`, label: presentation.symbol || presentation.name, sourceQuantity });
    }
  }
  return options;
}

export function quantityInSelectedUnit(value: number | null, unit: MatrixQuantityUnit) {
  return value === null ? null : Number((value / unit.sourceQuantity).toFixed(6));
}

export function quantityInOriginalUnit(value: number | null, unit: MatrixQuantityUnit) {
  return value === null ? null : Number((value * unit.sourceQuantity).toFixed(6));
}
