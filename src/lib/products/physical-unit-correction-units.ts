import type { QbUnit, QbUnitDimension, UnitOfMeasure } from "../../types/products";

function normalizeUnitLabel(value: string) {
  return value.trim().toLocaleLowerCase("es").replaceAll(".", "").replaceAll(" ", "");
}

export function getPhysicalCorrectionUnits(
  qbUnits: QbUnit[],
  qbUnitDimensions: QbUnitDimension[],
  units: UnitOfMeasure[],
) {
  const legacyUnitsByAbbreviation = new Map<string, UnitOfMeasure[]>();
  for (const unit of units.filter((item) => item.is_active)) {
    const key = normalizeUnitLabel(unit.abbreviation);
    legacyUnitsByAbbreviation.set(key, [...(legacyUnitsByAbbreviation.get(key) ?? []), unit]);
  }
  const dimensionsById = new Map(qbUnitDimensions.map((dimension) => [dimension.id, dimension]));

  return qbUnits.filter((unit) => {
    const dimensionCode = dimensionsById.get(unit.dimension_id)?.code;
    if (!unit.is_active || ["BS", "BOB"].includes(unit.symbol.trim().toUpperCase().replaceAll(".", "")) ||
      !["peso", "unidad", "volumen"].includes(dimensionCode ?? "") ||
      !Number.isFinite(Number(unit.conversion_factor_to_base)) || Number(unit.conversion_factor_to_base) <= 0) return false;

    const keys = new Set([normalizeUnitLabel(unit.symbol), normalizeUnitLabel(unit.code)]);
    const matches = new Set([...keys].flatMap((key) => legacyUnitsByAbbreviation.get(key) ?? []));
    const preferredMatches = [...matches].filter((legacy) => {
      const legacyName = normalizeUnitLabel(legacy.name);
      return legacyName === normalizeUnitLabel(unit.symbol) || legacyName === normalizeUnitLabel(unit.code);
    });
    // Prefer a catalog row whose name exactly matches the physical symbol/code.
    // This resolves duplicate labels such as KG and an unrelated "Kilogramo QA".
    return preferredMatches.length === 1 || (preferredMatches.length === 0 && matches.size === 1);
  });
}
