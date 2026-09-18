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
  // Legacy imports put CAJA, KG, UNIDAD, etc. in a single dimension with
  // placeholder factors of 1. Those are labels, NOT valid equivalences.
  if (base && !physicalDimensionIds.includes(base.dimension_id)) {
    const normalize = (label: string) => label.trim().toLocaleLowerCase("es");
    const source = units.find((unit) => unit.is_active && physicalDimensionIds.includes(unit.dimension_id)
      && [unit.symbol, unit.name].some((label) => normalize(label) === normalize(item.source_label)));
    if (!source) return options;
    for (const unit of units) {
      if (!unit.is_active || unit.dimension_id !== source.dimension_id || unit.id === source.id) continue;
      const sourceQuantity = Number(unit.conversion_factor_to_base) / Number(source.conversion_factor_to_base);
      if (sourceQuantity > 0 && Number.isFinite(sourceQuantity)) {
        options.push({ id: `unit:${unit.id}`, label: unit.symbol || unit.name, sourceQuantity });
      }
    }
    return options;
  }
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
