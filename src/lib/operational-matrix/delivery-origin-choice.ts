export type DeliveryOriginChoice =
  | "warehouse"
  | "pending"
  | "external"
  | "mixed";

export function allocationForDeliveryOrigin(
  choice: DeliveryOriginChoice,
  deliveredBaseQuantity: number,
) {
  const quantity = Math.max(Number.isFinite(deliveredBaseQuantity) ? deliveredBaseQuantity : 0, 0);
  return {
    deliveryWarehouseBaseQuantity: choice === "warehouse" ? quantity : 0,
    deliveryPendingBaseQuantity: choice === "pending" ? quantity : 0,
    deliveryExternalBaseQuantity: choice === "external" ? quantity : 0,
    deliveryReviewBaseQuantity: choice === "mixed" ? quantity : 0,
    deliverySourceConfirmed: choice === "warehouse" || choice === "pending" || choice === "external",
  };
}
