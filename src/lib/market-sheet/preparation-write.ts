import type { MarketSheetLineRef } from "@/lib/market-sheet/model";

type PreparationLineForWrite = Pick<
  MarketSheetLineRef,
  | "orderItemId"
  | "preparationVersion"
  | "requestedQuantity"
  | "requestedBaseQuantity"
  | "conversionValid"
  | "baseUnitId"
  | "inventoryBaseUnitId"
  | "preparationDisplayUnitId"
  | "quantityUnits"
  | "preparedQuantity"
  | "preparationCheck"
  | "preparationNote"
>;

export type PreparationWriteParams = {
  p_order_item_id: string;
  p_expected_version: number;
  p_prepared_quantity: number;
  p_preparation_check: boolean;
  p_actual_weight_kg: number | null;
  p_display_unit_id: string;
  p_note: string;
};

export type PreparationWritePlan =
  | { ok: true; params: PreparationWriteParams }
  | { ok: false; message: string };

export function planMarketPreparationWrite(
  lines: PreparationLineForWrite[],
  controlsActualWeight: boolean,
  actualValue: number | null,
): PreparationWritePlan {
  if (lines.length === 0) {
    return { ok: false, message: "No hay pedidos asociados para actualizar." };
  }
  if (lines.length > 1) {
    return {
      ok: false,
      message: "Esta fila agrupa varios pedidos y no se puede guardar en bloque. Edita cada línea desde Preparación para conservar su check, nota y versión.",
    };
  }

  const line = lines[0];
  if (!line) return { ok: false, message: "No hay una línea válida para actualizar." };
  if (!controlsActualWeight && actualValue === null) {
    return {
      ok: false,
      message: "La cantidad no puede quedar vacía desde la Hoja de Provisión. Edita la línea desde Preparación para restablecerla correctamente.",
    };
  }
  if (actualValue !== null && (!Number.isFinite(actualValue) || actualValue < 0)) {
    return { ok: false, message: "La cantidad o el peso real debe ser válido y no negativo." };
  }

  if (
    !line.conversionValid || !line.inventoryBaseUnitId || line.inventoryBaseUnitId !== line.baseUnitId ||
    !Number.isFinite(line.requestedBaseQuantity) || line.requestedBaseQuantity <= 0 ||
    !Number.isFinite(line.requestedQuantity) || line.requestedQuantity <= 0 ||
    !Number.isFinite(line.preparedQuantity) || !Number.isFinite(line.preparationVersion)
  ) {
    return {
      ok: false,
      message: "No se puede actualizar: revisa la conversión, unidad base y versión de la línea.",
    };
  }

  const lineActual = actualValue === null
    ? null
    : controlsActualWeight
      ? Number(actualValue.toFixed(4))
      : Number((actualValue * line.requestedQuantity / line.requestedBaseQuantity).toFixed(4));
  if (actualValue !== null && lineActual === null) {
    return { ok: false, message: "No se pudo convertir la cantidad real a la unidad del pedido." };
  }

  const displayUnitId = line.preparationDisplayUnitId === "original" ||
    line.quantityUnits.some((unit) => unit.id === line.preparationDisplayUnitId)
    ? line.preparationDisplayUnitId
    : "original";

  return {
    ok: true,
    params: {
      p_order_item_id: line.orderItemId,
      p_expected_version: line.preparationVersion,
      // Updating a measured weight must not change the commercial quantity.
      // Clearing weight preserves both the amount and the existing check.
      p_prepared_quantity: controlsActualWeight
        ? line.preparedQuantity
        : (lineActual ?? line.preparedQuantity),
      // The verification flag is independent: weighing a line never checks it.
      p_preparation_check: line.preparationCheck,
      p_actual_weight_kg: controlsActualWeight ? lineActual : null,
      p_display_unit_id: displayUnitId,
      // The RPC replaces this field, so always pass the captured note unchanged.
      p_note: line.preparationNote,
    },
  };
}
