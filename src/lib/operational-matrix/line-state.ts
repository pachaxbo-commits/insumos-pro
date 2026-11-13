const QUANTITY_EPSILON = 0.000001;

export type PreparationCoverage =
  | { status: "complete" }
  | { status: "short"; missingBaseQuantity: number }
  | { status: "over"; excessBaseQuantity: number }
  | { status: "unverified" };

/** Compare the immutable base-unit snapshots; source labels can differ (e.g. CUARTILLA vs KG). */
export function compareCommercialCoverage(
  requestedQuantity: number, actualQuantity: number, physicalBasisVerified: boolean,
): PreparationCoverage {
  return comparePreparationCoverage({
    requestedBaseQuantity: requestedQuantity,
    preparedBaseQuantity: actualQuantity,
    requestedConversionValid: physicalBasisVerified,
  });
}

export function comparePreparationCoverage(input: {
  requestedBaseQuantity: number;
  preparedBaseQuantity: number;
  requestedConversionValid: boolean;
  verified?: boolean;
}): PreparationCoverage {
  const { requestedBaseQuantity, preparedBaseQuantity } = input;
  if (
    input.verified === false ||
    !input.requestedConversionValid ||
    !Number.isFinite(requestedBaseQuantity) ||
    !Number.isFinite(preparedBaseQuantity) ||
    requestedBaseQuantity <= QUANTITY_EPSILON ||
    preparedBaseQuantity < 0
  ) {
    return { status: "unverified" };
  }

  const difference = requestedBaseQuantity - preparedBaseQuantity;
  const tolerance = Math.max(
    QUANTITY_EPSILON,
    Math.abs(requestedBaseQuantity) * QUANTITY_EPSILON,
  );
  if (Math.abs(difference) <= tolerance) return { status: "complete" };
  if (difference > 0) {
    return {
      status: "short",
      missingBaseQuantity: Number(difference.toFixed(6)),
    };
  }
  return {
    status: "over",
    excessBaseQuantity: Number(Math.abs(difference).toFixed(6)),
  };
}

type PreparationQuantityLine = {
  requestedQuantity: number;
  preparedQuantity: number;
  preparationCheck: boolean;
  preparationAutoFillPreviousQuantity?: number | null;
};

export type PreparationCheckTransition = {
  preparedQuantity: number;
  previousQuantity: number | null;
  autoFill: boolean;
  resetAutoFill: boolean;
};

/** Track only quantities inserted by the check action; manual values are never cleared. */
export function preparationCheckTransition(
  line: PreparationQuantityLine,
  checked: boolean,
  preserveZero = false,
): PreparationCheckTransition {
  if (checked) {
    const nextQuantity = preparedQuantityAfterCheck(line, true, preserveZero);
    const autoFill = !preserveZero && !line.preparationCheck &&
      line.preparedQuantity <= QUANTITY_EPSILON &&
      nextQuantity > line.preparedQuantity;
    return {
      preparedQuantity: nextQuantity,
      previousQuantity: autoFill ? line.preparedQuantity : line.preparationAutoFillPreviousQuantity ?? null,
      autoFill,
      resetAutoFill: false,
    };
  }
  if (line.preparationCheck && line.preparationAutoFillPreviousQuantity != null) {
    return {
      preparedQuantity: line.preparationAutoFillPreviousQuantity,
      previousQuantity: null,
      autoFill: false,
      resetAutoFill: true,
    };
  }
  return {
    preparedQuantity: line.preparedQuantity,
    previousQuantity: line.preparationAutoFillPreviousQuantity ?? null,
    autoFill: false,
    resetAutoFill: false,
  };
}

type DeliverySuggestionLine = {
  preparedAt: string | null;
  preparationCheck: boolean;
  preparedQuantity: number;
  preparedBaseQuantity: number;
  requestedQuantity: number;
  requestedBaseQuantity: number;
  originPlanConfirmed: boolean;
  plannedPendingBaseQuantity: number;
  plannedExternalBaseQuantity: number;
  preparationDisplayUnitId: string | null;
  preparationActualWeightKg: number | null;
  preparationActualWeightValue?: number | null;
  preparationActualWeightUnitId?: string | null;
  preparationActualWeightUnitSymbol?: string | null;
  preparationActualWeightFactorToKg?: number | null;
  deliveredAt: string | null;
  deliveryVersion: number;
  deliveredQuantity: number;
  deliveredBaseQuantity: number;
  deliveryDisplayUnitId: string | null;
  deliveryActualWeightKg: number | null;
  deliveryActualWeightValue?: number | null;
  deliveryActualWeightUnitId?: string | null;
  deliveryActualWeightUnitSymbol?: string | null;
  deliveryActualWeightFactorToKg?: number | null;
  deliveryCheck: boolean;
  deliveryWarehouseBaseQuantity: number;
  deliveryPendingBaseQuantity: number;
  deliveryExternalBaseQuantity: number;
  deliveryReviewBaseQuantity: number;
  deliverySourceConfirmed: boolean;
};

export function preparedQuantityAfterCheck(
  line: PreparationQuantityLine,
  checked: boolean,
  preserveZero = false,
) {
  if (
    !checked ||
    preserveZero ||
    line.preparationCheck ||
    line.preparedQuantity > QUANTITY_EPSILON
  ) {
    return line.preparedQuantity;
  }
  return line.requestedQuantity;
}

export function applyAutomaticDeliveryValues<T extends DeliverySuggestionLine>(
  lines: T[],
) {
  return lines.map((line) => {
    const isNewDelivery =
      line.preparedAt !== null &&
      line.preparationCheck &&
      (line.preparedQuantity > QUANTITY_EPSILON || line.originPlanConfirmed) &&
      line.deliveredAt === null &&
      line.deliveryVersion === 0 &&
      line.deliveredQuantity <= QUANTITY_EPSILON &&
      !line.deliveryCheck;
    if (!isNewDelivery) return line;

    const usePreparationPlan = line.originPlanConfirmed &&
      Math.abs(
        line.preparedBaseQuantity + line.plannedPendingBaseQuantity +
        line.plannedExternalBaseQuantity - line.requestedBaseQuantity,
      ) <= QUANTITY_EPSILON;

    return {
      ...line,
      deliveredQuantity: usePreparationPlan ? line.requestedQuantity : line.preparedQuantity,
      deliveredBaseQuantity: usePreparationPlan ? line.requestedBaseQuantity : line.preparedBaseQuantity,
      deliveryDisplayUnitId: line.preparationDisplayUnitId,
      deliveryActualWeightKg:
        line.deliveryActualWeightKg ?? line.preparationActualWeightKg,
      ...(line.deliveryActualWeightKg === null && line.preparationActualWeightValue != null ? {
        deliveryActualWeightValue: line.preparationActualWeightValue,
        deliveryActualWeightUnitId: line.preparationActualWeightUnitId,
        deliveryActualWeightUnitSymbol: line.preparationActualWeightUnitSymbol,
        deliveryActualWeightFactorToKg: line.preparationActualWeightFactorToKg,
      } : {}),
      deliveryWarehouseBaseQuantity: usePreparationPlan ? line.preparedBaseQuantity : 0,
      deliveryPendingBaseQuantity: usePreparationPlan ? line.plannedPendingBaseQuantity : 0,
      deliveryExternalBaseQuantity: usePreparationPlan ? line.plannedExternalBaseQuantity : 0,
      deliveryReviewBaseQuantity: usePreparationPlan ? 0 : line.preparedBaseQuantity,
      deliverySourceConfirmed: usePreparationPlan,
      // This is only a starting suggestion. The deliverer still has to verify it.
      deliveryCheck: false,
    };
  });
}

export function updateDeliveryChecks<T extends { orderItemId: string; deliveryCheck: boolean }>(
  lines: T[],
  selectedIds: Set<string>,
  checked: boolean,
) {
  return lines.map((line) =>
    selectedIds.has(line.orderItemId) && line.deliveryCheck !== checked
      ? { ...line, deliveryCheck: checked }
      : line,
  );
}
