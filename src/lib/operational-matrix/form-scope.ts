import type { MatrixLine, MatrixOrder } from "@/types/operational-matrix";

/** Scope a form action to the selected order, never to the whole operational day. */
export function linesForOrder(lines: MatrixLine[], orderId: string) {
  return lines.filter((line) => line.orderId === orderId);
}

export function actionableOrders(
  orders: MatrixOrder[],
  orderIds: ReadonlySet<string>,
  action: "confirm" | "reopen",
) {
  return orders.filter((order) => {
    if (!orderIds.has(order.id)) return false;
    return action === "confirm"
      ? ["pendiente_preparacion", "en_preparacion", "preparado"].includes(order.status) &&
          order.deliveryStatus !== "confirmado"
      : order.deliveryStatus === "confirmado";
  });
}
