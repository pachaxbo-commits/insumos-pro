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
  | "originPlanConfirmed"
  | "plannedPendingBaseQuantity"
  | "plannedExternalBaseQuantity"
  | "plannedReviewBaseQuantity"
>;

export type PreparationWriteParams = {
  p_order_item_id: string;
  p_expected_version: number;
  p_prepared_quantity: number;
  p_preparation_check: boolean;
  p_actual_weight_value: null;
  p_actual_weight_unit_id: null;
  p_actual_weight_factor_to_kg: null;
  p_clear_actual_weight: false;
  p_display_unit_id: string;
  p_note: string;
  p_pending_base_quantity: number;
  p_external_base_quantity: number;
  p_review_base_quantity: number;
  p_origin_plan_confirmed: boolean;
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

  if (controlsActualWeight) {
    return {
      ok: false,
      message: "El peso real no se puede editar desde la Hoja de Provisión. Ábrelo en Preparación para conservar la unidad original del peso.",
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
      // This sheet only edits commercial quantity. The weight snapshot is
      // deliberately omitted and preserved by the snapshot-aware RPC.
      p_prepared_quantity: lineActual ?? line.preparedQuantity,
      p_preparation_check: line.preparationCheck,
      p_actual_weight_value: null,
      p_actual_weight_unit_id: null,
      p_actual_weight_factor_to_kg: null,
      p_clear_actual_weight: false,
      p_display_unit_id: displayUnitId,
      p_note: line.preparationNote,
      p_pending_base_quantity: line.plannedPendingBaseQuantity,
      p_external_base_quantity: line.plannedExternalBaseQuantity,
      p_review_base_quantity: line.plannedReviewBaseQuantity,
      p_origin_plan_confirmed: line.originPlanConfirmed,
    },
  };
}
