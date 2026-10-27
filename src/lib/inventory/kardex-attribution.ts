export type KardexAttribution = {
  source: "delivery" | "reconciliation";
  orderId: string;
  orderReference: string;
  customerName: string;
  quantity: number;
  occurredAt: string | null;
};

export function resolveKardexAttribution(
  attributions: KardexAttribution[],
  movementQuantity: number,
) {
  const totalLinkedQuantity = attributions.reduce((total, item) => total + item.quantity, 0);
  const quantityMismatch = Math.abs(totalLinkedQuantity - movementQuantity) > 0.000001;
  return {
    attributions,
    ambiguous: attributions.length > 1 || quantityMismatch,
    totalLinkedQuantity,
  };
}
