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

export type WarehousePurchasePresentation = {
  id: string;
  productId: string;
  baseUnitId: string;
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
}): WarehousePurchaseOption[] {
  if (!baseDimensionId) return [];

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
    if (!unit.isActive || unit.dimensionId !== baseDimensionId || isCurrencyQuantitySymbol(unit.symbol)) return [];

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
      presentationBaseUnit.dimensionId !== baseDimensionId
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
