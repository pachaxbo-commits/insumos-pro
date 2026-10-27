export type OriginDistribution = {
  warehouse: number;
  pendingToday: number;
  externalDefinitive: number;
  review: number;
};

export function resolveDeliveryOrigin(input: {
  persisted: boolean;
  persistedOrigin: OriginDistribution;
  legacyDeliveredBaseQuantity: number;
  preparationOrigin: OriginDistribution;
}): OriginDistribution {
  if (input.persisted) return input.persistedOrigin;
  if (input.legacyDeliveredBaseQuantity > EPSILON) {
    // Existing deliveries have no trustworthy source breakdown. Keep the full
    // delivered amount visible for review rather than inferring warehouse or
    // external supply (or counting it in both buckets).
    return {
      warehouse: 0,
      pendingToday: 0,
      externalDefinitive: 0,
      review: input.legacyDeliveredBaseQuantity,
    };
  }
  return input.preparationOrigin;
}

const EPSILON = 0.00001;

export function originDistributionTotal(origin: OriginDistribution) {
  return origin.warehouse + origin.pendingToday + origin.externalDefinitive + origin.review;
}

export function originDistributionMatches(origin: OriginDistribution, expected: number) {
  return Number.isFinite(expected) && expected >= 0 && Math.abs(originDistributionTotal(origin) - expected) <= EPSILON;
}

export function originDistributionIsResolved(origin: OriginDistribution, expected: number) {
  return origin.review <= EPSILON && originDistributionMatches(origin, expected);
}

export function sourceQuantityToBase(quantity: number, basePerSourceQuantity: number) {
  if (!Number.isFinite(quantity) || !Number.isFinite(basePerSourceQuantity) || basePerSourceQuantity <= 0) return 0;
  return Number((quantity * basePerSourceQuantity).toFixed(6));
}

export function baseQuantityToSource(quantity: number, basePerSourceQuantity: number) {
  if (!Number.isFinite(quantity) || !Number.isFinite(basePerSourceQuantity) || basePerSourceQuantity <= 0) return 0;
  return Number((quantity / basePerSourceQuantity).toFixed(6));
}
