const QUANTITY_EPSILON = 0.000001;

export type PreparationCoverage =
  | { status: "complete" }
  | { status: "short"; missingBaseQuantity: number }
  | { status: "over"; excessBaseQuantity: number }
  | { status: "unverified" };

/** Compare the immutable base-unit snapshots; source labels can differ (e.g. CUARTILLA vs KG). */
export function comparePreparationCoverage(input: {
  requestedBaseQuantity: number;
  preparedBaseQuantity: number;
  requestedConversionValid: boolean;
}): PreparationCoverage {
  const { requestedBaseQuantity, preparedBaseQuantity } = input;
  if (
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
};

type DeliverySuggestionLine = {
  preparedAt: string | null;
  preparationCheck: boolean;
  preparedQuantity: number;
  preparedBaseQuantity: number;
  preparationDisplayUnitId: string | null;
  preparationActualWeightKg: number | null;
  deliveredAt: string | null;
  deliveryVersion: number;
  deliveredQuantity: number;
  deliveredBaseQuantity: number;
  deliveryDisplayUnitId: string | null;
  deliveryActualWeightKg: number | null;
  deliveryCheck: boolean;
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
      line.preparedQuantity > QUANTITY_EPSILON &&
      line.deliveredAt === null &&
      line.deliveryVersion === 0 &&
      line.deliveredQuantity <= QUANTITY_EPSILON &&
      !line.deliveryCheck;
    if (!isNewDelivery) return line;

    return {
      ...line,
      deliveredQuantity: line.preparedQuantity,
      deliveredBaseQuantity: line.preparedBaseQuantity,
      deliveryDisplayUnitId: line.preparationDisplayUnitId,
      deliveryActualWeightKg:
        line.deliveryActualWeightKg ?? line.preparationActualWeightKg,
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
