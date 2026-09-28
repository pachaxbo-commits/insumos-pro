import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { serializeOrderItems } from "../src/lib/qb-orders/draft-payload.ts";
import { linesForOrder, actionableOrders } from "../src/lib/operational-matrix/form-scope.ts";
import { summarizeHistory } from "../src/lib/operational-history/summary.ts";

test("dos pasos conservan el payload de pedido", () => {
  const lines = [{ productId: "tomate", allowedUnitId: "kg", quantity: "10", notes: "maduro" }];
  assert.equal(serializeOrderItems(lines), JSON.stringify([{
    productId: "tomate", inputMode: "quantity", allowedUnitId: "kg", quantity: 10, notes: "maduro",
  }]));
});

test("tres productos del pedido A se editan sin incluir al pedido B", () => {
  const lines = ["a1", "a2", "a3"].map((id) => ({ orderItemId: id, orderId: "A", preparedQuantity: 0 }))
    .concat([{ orderItemId: "b1", orderId: "B", preparedQuantity: 0 }]);
  const next = lines.map((line) => linesForOrder(lines, "A").some((item) => item.orderItemId === line.orderItemId)
    ? { ...line, preparedQuantity: 9 } : line);
  assert.deepEqual(linesForOrder(next, "A").map((line) => line.preparedQuantity), [9, 9, 9]);
  assert.equal(linesForOrder(next, "B")[0].preparedQuantity, 0);
});

test("confirmar pedido A no confirma pedido B del mismo cliente", () => {
  const orders = ["A", "B"].map((id) => ({ id, status: "en_preparacion", deliveryStatus: null }));
  assert.deepEqual(actionableOrders(orders, new Set(["A"]), "confirm").map((order) => order.id), ["A"]);
});

test("Formulario y Tabla usan las mismas líneas y el mismo estado", () => {
  const matrix = readFileSync("src/components/operational-matrix/operational-matrix.tsx", "utf8");
  assert.match(matrix, /linesForOrder\(lines, order\.id\)/);
  assert.match(matrix, /groupLineMap\.get/);
  assert.match(matrix, /const showForm = viewMode === "formulario"/);
  assert.match(matrix, /updateGroupedLines\(\[line\]/);
});

test("historial suma pedidos y líneas sin mezclar unidades", () => {
  const orders = [
    { id: "A", date: "2026-09-28", reference: "A", customerId: "c1", customerName: "Uno", status: "recibo_emitido", receipts: [], lines: [
      { productId: "tomate", productName: "Tomate", unit: "KG", requested: 10, prepared: 9, delivered: 8 },
      { productId: "papa", productName: "Papa", unit: "ARROBA", requested: 1, prepared: 1, delivered: 1 },
    ] },
    { id: "B", date: "2026-09-28", reference: "B", customerId: "c2", customerName: "Dos", status: "en_preparacion", receipts: [], lines: [
      { productId: "tomate", productName: "Tomate", unit: "LIBRA", requested: 2, prepared: 0, delivered: 0 },
    ] },
  ];
  const summary = summarizeHistory(orders);
  assert.equal(summary.orderCount, 2);
  assert.equal(summary.deliveredOrderCount, 1);
  assert.deepEqual(summary.requestedProductRanking[0], { name: "Tomate", lines: 2 });
  assert.deepEqual(summary.deliveredProductRanking[0], { name: "Tomate", lines: 1 });
});

test("check parcial permanece restringido por la RPC vigente", () => {
  const sql = readFileSync("supabase/migrations/20260723130100_qb_operational_matrix_workflows.sql", "utf8");
  assert.match(sql, /p_preparation_check and abs\(p_prepared_quantity - v_order_item\.requested_quantity\) > 0\.000001/);
});
