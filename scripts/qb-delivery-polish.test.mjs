import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");
const matrix = read("src/components/operational-matrix/operational-matrix.tsx");
const migration = read("supabase/migrations/20260918010000_qb_optional_actual_weight.sql");

test("todos los productos muestran cantidad y peso sin depender de la bandera del catálogo", () => {
  assert.equal((matrix.match(/<MeasuredQuantityEditor/g) ?? []).length, 3);
  assert.doesNotMatch(matrix, /controlsActualWeight \? \(\s*<MeasuredQuantityEditor/);
  assert.match(matrix, /actualWeightKg: line\.preparationActualWeightKg,/);
  assert.match(matrix, /actualWeightKg: line\.deliveryActualWeightKg,/);
  assert.match(matrix, /line\.deliveryActualWeightKg !== null\s*\?/);
});

test("entrega hereda peso opcional y conserva el cero ingresado explícitamente", () => {
  const start = matrix.indexOf("function applyAutomaticDeliveryValues(");
  const end = matrix.indexOf("function mergeServerLines(", start);
  const js = ts.transpileModule(`export ${matrix.slice(start, end)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exported = {};
  runInNewContext(js, { exports: exported, hasCompletePreparation: () => true });
  const base = { controlsActualWeight: false, deliveredAt: null, deliveryVersion: 0, preparedQuantity: 5,
    deliveredQuantity: 0, preparationActualWeightKg: 0.416, deliveryActualWeightKg: null };
  assert.equal(exported.applyAutomaticDeliveryValues([base])[0].deliveryActualWeightKg, 0.416);
  assert.equal(exported.applyAutomaticDeliveryValues([{ ...base, deliveryActualWeightKg: 0 }])[0].deliveryActualWeightKg, 0);
  assert.equal(exported.applyAutomaticDeliveryValues([{ ...base, preparationActualWeightKg: 0 }])[0].deliveryActualWeightKg, 0);
  assert.equal(exported.applyAutomaticDeliveryValues([{ ...base, deliveredAt: "saved", deliveryActualWeightKg: 0.25 }])[0].deliveryActualWeightKg, 0.25);
});

test("SQL acepta peso manual, conserva auditoría y no modifica el catálogo ni recibos anteriores", () => {
  assert.doesNotMatch(migration, /update public\.products|update public\.qb_receipt_lines/i);
  assert.doesNotMatch(migration, /and product\.controls_actual_weight/);
  assert.match(migration, /v_controls_actual_weight or p_actual_weight_kg is not null/);
  assert.match(migration, /public\.save_qb_matrix_delivery_item_with_weight_v1/);
  assert.match(migration, /v_effective_weight < v_preparation_item\.actual_weight_kg/);
  assert.match(migration, /replayed[\s\S]*return v_result;[\s\S]*update public\.qb_order_delivery_items/);
  assert.match(migration, /v_effective_weight is not null and v_price_unit_kg_factor is not null/);
  assert.match(migration, /new\.pricing_unit_id := v_price_unit_id/);
});

test("hoja de compras tiene destino directo y costos permanece en el recibo", () => {
  const sidebar = read("src/components/layout/app-sidebar.tsx");
  const receipts = read("src/components/qb-receipts/qb-receipts-management.tsx");
  const market =
    read("src/app/(private)/matriz-operativa/mercado/page.tsx") +
    read("src/app/(private)/matriz-operativa/mercado/market-sheet-table.tsx");
  assert.match(sidebar, /href="\/matriz-operativa\/mercado"/);
  assert.doesNotMatch(sidebar, /href="\/recibos\?section=borradores"/);
  assert.doesNotMatch(receipts, /Las 2 tablas solicitadas|Tabla 1 ·|Tabla 2 ·/);
  assert.match(receipts, /TabsTrigger value="costos"/);
  assert.match(market, /name="date"/);
  assert.match(market, /COSTO DE PROVISIÓN \(Bs\/UD\)/);
  assert.match(market, /model\.customerLineCounts/);
  assert.match(market, /model\.totalLineCount/);
  assert.doesNotMatch(market, /rows\.reduce\(\(sum, row\) => sum \+ row\.total/);
});
