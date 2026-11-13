import type { MatrixLine, MatrixOrder } from "@/types/operational-matrix";

/** Scope a form action to the selected order, never to the whole operational day. */
export function linesForOrder(lines: MatrixLine[], orderId: string) {
  return lines.filter((line) => line.orderId === orderId);
}

export function canEditMatrixOrder(order: Pick<MatrixOrder, "status" | "deliveryStatus">) {
  return order.status !== "cancelado" && order.deliveryStatus !== "confirmado";
}

export function canEditMatrixGroupLines(
  lines: Pick<MatrixLine, "orderId">[],
  orders: Pick<MatrixOrder, "id" | "status" | "deliveryStatus">[],
  stage: "preparacion" | "entrega",
) {
  return lines.length > 0 && lines.every(({ orderId }) => {
    const order = orders.find(({ id }) => id === orderId);
    if (!order || order.deliveryStatus === "confirmado") return false;
    return order.status === "pendiente_preparacion" || order.status === "en_preparacion" ||
      (stage === "entrega" && order.status === "preparado");
  });
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
