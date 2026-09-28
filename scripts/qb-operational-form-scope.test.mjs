import assert from "node:assert/strict";
import test from "node:test";

import { actionableOrders, linesForOrder } from "../src/lib/operational-matrix/form-scope.ts";

test("dos clientes con dos productos conservan pedido y confirmación independientes", () => {
  const orders = [
    { id: "pedido-a", customerKey: "cliente-a", status: "preparado", deliveryStatus: null },
    { id: "pedido-b", customerKey: "cliente-b", status: "preparado", deliveryStatus: null },
  ];
  const lines = [
    { orderId: "pedido-a", orderItemId: "a-tomate", deliveredQuantity: 0 },
    { orderId: "pedido-a", orderItemId: "a-papa", deliveredQuantity: 0 },
    { orderId: "pedido-b", orderItemId: "b-tomate", deliveredQuantity: 0 },
    { orderId: "pedido-b", orderItemId: "b-papa", deliveredQuantity: 0 },
  ];

  const firstOrderLines = linesForOrder(lines, "pedido-a");
  assert.deepEqual(firstOrderLines.map((line) => line.orderItemId), ["a-tomate", "a-papa"]);
  const edited = lines.map((line) => line.orderId === "pedido-a"
    ? { ...line, deliveredQuantity: line.orderItemId === "a-tomate" ? 9 : 4 }
    : line);
  assert.deepEqual(linesForOrder(edited, "pedido-a").map((line) => line.deliveredQuantity), [9, 4]);
  assert.deepEqual(linesForOrder(edited, "pedido-b"), linesForOrder(lines, "pedido-b"));

  const toConfirm = actionableOrders(orders, new Set(["pedido-a"]), "confirm");
  assert.deepEqual(toConfirm.map((order) => order.id), ["pedido-a"]);
  const afterConfirm = orders.map((order) => toConfirm.some((target) => target.id === order.id)
    ? { ...order, deliveryStatus: "confirmado" }
    : order);
  assert.equal(afterConfirm[0].deliveryStatus, "confirmado");
  assert.equal(afterConfirm[1].deliveryStatus, null);
  assert.deepEqual(
    actionableOrders(afterConfirm, new Set(["pedido-b"]), "confirm").map((order) => order.id),
    ["pedido-b"],
  );
  const editedB = edited.map((line) => line.orderId === "pedido-b"
    ? { ...line, deliveredQuantity: line.orderItemId === "b-tomate" ? 7 : 3 }
    : line);
  assert.deepEqual(linesForOrder(editedB, "pedido-b").map((line) => line.deliveredQuantity), [7, 3]);
  assert.deepEqual(linesForOrder(editedB, "pedido-a"), linesForOrder(edited, "pedido-a"));
});
