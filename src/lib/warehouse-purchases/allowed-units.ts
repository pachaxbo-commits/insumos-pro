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
  dimensionCode: string;
  symbol: string;
  factorToBase: number;
  isActive: boolean;
};

export type WarehousePurchasePresentation = {
  id: string;
  productId: string;
  baseUnitId: string;
  baseQuantity: number;
  conversionFactorToBase: number;
  isActive: boolean;
  allowPurchase: boolean;
};

export type WarehousePurchaseOption = {
  id: string;
  allowedUnitId: string | null;
  unitId: string | null;
  presentationId: string | null;
};

function isCurrencyQuantitySymbol(symbol: string) {
  return ["BS", "BOB"].includes(symbol.trim().toUpperCase().replaceAll(".", ""));
}

export function getWarehousePurchaseUnits({
  productId,
  baseUnitId,
  baseDimensionId,
  baseDimensionCode,
  baseFactorToBase,
  allowedUnits,
  units,
  presentations,
}: {
  productId: string;
  baseUnitId: string | null;
  baseDimensionId: string | null;
  baseDimensionCode: string | null;
  baseFactorToBase: number | null;
  allowedUnits: WarehousePurchaseAllowedUnit[];
  units: WarehousePurchasePhysicalUnit[];
  presentations: WarehousePurchasePresentation[];
}): WarehousePurchaseOption[] {
  if (!baseUnitId || !baseDimensionId || !baseDimensionCode || typeof baseFactorToBase !== "number" || !Number.isFinite(baseFactorToBase) || baseFactorToBase <= 0) return [];

  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const presentationsById = new Map(presentations.map((presentation) => [presentation.id, presentation]));
  const productReceptionUnits = allowedUnits.filter(
    (allowed) => allowed.productId === productId && allowed.context === "recepcion",
  );
  const receptionUnitById = new Map(
    productReceptionUnits
      .filter((allowed) => allowed.unitId && !allowed.presentationId)
      .map((allowed) => [allowed.unitId as string, allowed]),
  );

  const physicalUnits = units.flatMap((unit) => {
    const isBaseUnit = unit.id === baseUnitId;
    if (
      !unit.isActive ||
      unit.dimensionId !== baseDimensionId ||
      unit.dimensionCode !== baseDimensionCode ||
      isCurrencyQuantitySymbol(unit.symbol) ||
      !Number.isFinite(unit.factorToBase) || unit.factorToBase <= 0 ||
      (!isBaseUnit && (unit.dimensionCode === "legacy_dump" || baseDimensionCode === "legacy_dump"))
    ) return [];

    const existing = receptionUnitById.get(unit.id);
    // An explicitly disabled product mapping remains disabled. A missing mapping
    // is created by the authorized server action after the user selects it.
    if (existing && !existing.isActive) return [];

    return [{
      id: `unit:${unit.id}`,
      allowedUnitId: existing?.id ?? null,
      unitId: unit.id,
      presentationId: null,
    }];
  });

  const configuredPresentations = productReceptionUnits.flatMap((allowed) => {
    if (!allowed.isActive || Boolean(allowed.unitId) === Boolean(allowed.presentationId)) return [];
    if (!allowed.presentationId) return [];

    const presentation = presentationsById.get(allowed.presentationId);
    const presentationBaseUnit = presentation ? unitsById.get(presentation.baseUnitId) : null;
    if (
      !presentation ||
      presentation.productId !== productId ||
      !presentation.isActive ||
      !presentation.allowPurchase ||
      !presentationBaseUnit?.isActive ||
      isCurrencyQuantitySymbol(presentationBaseUnit.symbol) ||
      !Number.isFinite(presentation.baseQuantity) || presentation.baseQuantity <= 0 ||
      !Number.isFinite(presentation.conversionFactorToBase) || presentation.conversionFactorToBase <= 0 ||
      presentationBaseUnit.dimensionId !== baseDimensionId ||
      presentationBaseUnit.dimensionCode !== baseDimensionCode ||
      (baseDimensionCode === "legacy_dump" && presentation.baseUnitId !== baseUnitId)
    ) return [];

    return [{
      id: `presentation:${presentation.id}`,
      allowedUnitId: allowed.id,
      unitId: null,
      presentationId: presentation.id,
    }];
  });

  return [...physicalUnits, ...configuredPresentations];
}
