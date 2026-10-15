export type WarehousePurchaseAllowedUnit = {
  id: string;
  productId: string;
  context: string;
  unitId: string | null;
  presentationId: string | null;
  isActive: boolean;
};

export type WarehousePurchasePhysicalUnit = {
  id: string;
  dimensionId: string;
  symbol: string;
  isActive: boolean;
};

function isCurrencyQuantitySymbol(symbol: string) {
  return ["BS", "BOB"].includes(symbol.trim().toUpperCase().replaceAll(".", ""));
}

export type WarehousePurchasePresentation = {
  id: string;
  productId: string;
  baseUnitId: string;
  isActive: boolean;
  allowPurchase: boolean;
};

export function getWarehousePurchaseUnits({
  productId,
  baseDimensionId,
  allowedUnits,
  units,
  presentations,
}: {
  productId: string;
  baseDimensionId: string | null;
  allowedUnits: WarehousePurchaseAllowedUnit[];
  units: WarehousePurchasePhysicalUnit[];
  presentations: WarehousePurchasePresentation[];
}) {
  if (!baseDimensionId) return [];

  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const presentationsById = new Map(presentations.map((presentation) => [presentation.id, presentation]));

  return allowedUnits
    .filter((allowed) => {
      if (allowed.productId !== productId || allowed.context !== "recepcion" || !allowed.isActive) return false;
      // An allowed source must point to exactly one physical unit or presentation.
      if (Boolean(allowed.unitId) === Boolean(allowed.presentationId)) return false;

      if (allowed.unitId) {
        const unit = unitsById.get(allowed.unitId);
        return Boolean(unit?.isActive && !isCurrencyQuantitySymbol(unit.symbol) && unit.dimensionId === baseDimensionId);
      }

      const presentation = presentationsById.get(allowed.presentationId ?? "");
      const presentationBaseUnit = presentation ? unitsById.get(presentation.baseUnitId) : null;
      return Boolean(
        presentation &&
        presentation.productId === productId &&
        presentation.isActive &&
        presentation.allowPurchase &&
        presentationBaseUnit?.isActive &&
        !isCurrencyQuantitySymbol(presentationBaseUnit.symbol) &&
        presentationBaseUnit.dimensionId === baseDimensionId,
      );
    });
}
