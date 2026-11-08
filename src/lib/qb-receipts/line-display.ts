export type ReceiptLineMeasurementDisplay = {
  deliveredBaseQuantity: number;
  baseUnitSymbol: string;
  commercialQuantitySnapshot: number | null;
  commercialUnitLabelSnapshot: string | null;
  actualWeightValue: number | null;
  actualWeightUnitSymbol: string | null;
  actualWeightKilograms: number | null;
};

const quantity = (value: number) => new Intl.NumberFormat("es-BO", {
  maximumFractionDigits: 6,
}).format(value);

export function formatReceiptCommercialQuantity(line: ReceiptLineMeasurementDisplay) {
  if (line.commercialQuantitySnapshot === null || !line.commercialUnitLabelSnapshot?.trim()) {
    return "No registrada en este recibo histórico";
  }

  return `${quantity(line.commercialQuantitySnapshot)} ${line.commercialUnitLabelSnapshot}`;
}

export function formatReceiptDeliveredBaseQuantity(line: ReceiptLineMeasurementDisplay) {
  return `${quantity(line.deliveredBaseQuantity)} ${line.baseUnitSymbol}`;
}

export function formatReceiptActualWeight(line: ReceiptLineMeasurementDisplay) {
  if (line.actualWeightValue !== null && line.actualWeightUnitSymbol?.trim()) {
    return `${quantity(line.actualWeightValue)} ${line.actualWeightUnitSymbol}`;
  }

  if (line.actualWeightKilograms !== null) {
    return `${quantity(line.actualWeightKilograms)} KG (normalizado; unidad original no registrada)`;
  }

  return "No registrado";
}
