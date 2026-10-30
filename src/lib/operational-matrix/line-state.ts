const QUANTITY_EPSILON = 0.000001;

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
