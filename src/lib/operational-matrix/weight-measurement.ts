export type WeightUnitFactor = { id: string; symbol: string; kilograms: number };

export type WeightMeasurementSnapshot = {
  value: number;
  unitId: string;
  factorToKg: number;
  kilograms: number;
};

export function createWeightMeasurementSnapshot(
  value: number,
  unit: WeightUnitFactor,
): WeightMeasurementSnapshot {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("El peso debe ser un número finito igual o mayor que cero.");
  }
  if (!unit.id || !unit.symbol || !Number.isFinite(unit.kilograms) || unit.kilograms <= 0) {
    throw new Error("La unidad de peso no tiene un factor válido a KG.");
  }
  const normalizedValue = Number(value.toFixed(6));
  const factorToKg = Number(unit.kilograms.toFixed(9));
  return {
    value: normalizedValue,
    unitId: unit.id,
    factorToKg,
    kilograms: Number((normalizedValue * factorToKg).toFixed(6)),
  };
}

export function formatWeightMeasurement(input: {
  value: number | null;
  unitSymbol: string | null;
  kilograms: number | null;
  format: (value: number) => string;
}) {
  if (input.value !== null && input.unitSymbol) {
    return `${input.format(input.value)} ${input.unitSymbol}`;
  }
  return input.kilograms === null ? null : `${input.format(input.kilograms)} KG`;
}
