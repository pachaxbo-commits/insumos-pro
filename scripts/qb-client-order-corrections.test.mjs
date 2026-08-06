import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const creator = read("src/components/qb-orders/internal-order-creator.tsx");
const lazyCreator = read(
  "src/components/qb-orders/lazy-internal-order-creator.tsx",
);
const workspace = read(
  "src/components/qb-orders/order-creation-workspace.tsx",
);
const orderActions = read("src/lib/qb-orders/actions.ts");
const matrixData = read("src/lib/operational-matrix/data.ts");
const matrix = read(
  "src/components/operational-matrix/operational-matrix.tsx",
);
const migration = read(
  "supabase/migrations/20260731010000_qb_admin_order_edit.sql",
);

test("la fecha de entrega inicia y se reinicia en mañana", () => {
  assert.match(creator, /function boliviaTomorrow\(\)/);
  assert.match(
    creator,
    /editingOrder\?\.operationalDate \?\? boliviaTomorrow/,
  );
  assert.match(creator, /setOperationalDate\(boliviaTomorrow\(\)\)/);
});

test("el historial aparece solo y no selecciona productos", () => {
  assert.match(creator, /getAverageRepeatableOrderAction/);
  assert.match(creator, /Historial cargado autom/);
  assert.doesNotMatch(creator, /Usar promedio/);
  assert.match(creator, /checked=\{selected\}/);
  assert.match(creator, /visibleUnit\?\.label/);
});

test("la lista permite filtrar por entrega y editar pedidos pendientes", () => {
  assert.match(workspace, /Filtrar por fecha/);
  assert.match(workspace, /order\.operationalDate >= dateFrom/);
  assert.match(workspace, /order\.operationalDate <= dateTo/);
  assert.match(workspace, /Editar pedido/);
  assert.match(workspace, /order\.status === "pendiente_preparacion"/);
  assert.match(lazyCreator, /editingOrder=\{editingOrder\}/);
});

test("la edición administrativa valida concurrencia y preparación", () => {
  assert.match(orderActions, /admin_update_qb_internal_order/);
  assert.match(migration, /QB_ORDER_EDIT_CONFLICT/);
  assert.match(migration, /QB_ORDER_EDIT_STARTED/);
  assert.match(migration, /for update/);
  assert.match(migration, /qb_order_preparations/);
});

test("las notas del pedido llegan a preparación y entrega", () => {
  assert.match(matrixData, /customer_notes/);
  assert.match(matrixData, /requestedNote/);
  assert.match(matrix, /Nota del pedido:/);
  assert.match(matrix, /Pedido: \{line\.requestedNote\}/);
  assert.match(matrix, /line\.requestedNote/);
});
