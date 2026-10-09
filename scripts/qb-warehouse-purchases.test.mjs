import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { autoReferencePriceFromPurchaseUnit, purchaseTotal, referenceCostForUnit } from "../src/lib/warehouse-purchases/model.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261007120000_qb_warehouse_purchase_reference.sql", import.meta.url), "utf8");
const sheet = readFileSync(new URL("../src/app/(private)/ingresos/compras-almacen/warehouse-purchase-table.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../src/app/(private)/ingresos/compras-almacen/warehouse-purchase-sheet.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../src/lib/qb-ingresos/actions.ts", import.meta.url), "utf8");

test("1 carga × Bs 420 totals Bs 420", () => assert.equal(purchaseTotal(1, 420), 420));
test("manual reference Bs 48 is not carga/10", () => assert.equal(referenceCostForUnit(48, { dimensionId: "weight", factorToBase: 1 }, { dimensionId: "weight", factorToBase: 1 }), 48));
test("manual reference can be edited from 48 to 50 before confirmation", () => { assert.match(sheet, /updateWarehousePurchaseAction/); assert.match(migration, /reference_price numeric/); });
test("discard observation does not recalculate reference price", () => { assert.match(sheet, /notes/); assert.doesNotMatch(migration, /total_cost\s*\/\s*10/); });
test("two purchases of the same product are separate receipt lines", () => { assert.doesNotMatch(migration, /unique\s*\([^)]*product_id[^)]*receipt_date/); assert.match(actions, /\.from\("qb_merchandise_receipts"\)\s*\.insert/); });
test("observation is saved and exported", () => { const route = readFileSync(new URL("../src/app/api/ingresos/compras-almacen.xlsx/route.ts", import.meta.url), "utf8"); assert.match(actions, /notes: input\.notes/); assert.match(route, /row\.notes/); });
test("later QB receipt snapshots latest confirmed purchase", () => { assert.match(migration, /receipt\.status = 'confirmado'/); assert.match(migration, /order by receipt\.confirmed_at desc/); assert.match(migration, /before insert on public\.qb_receipt_lines/); });
test("historical issued receipt is not repriced by a later purchase", () => { assert.doesNotMatch(migration, /update\s+public\.qb_receipt_lines\s+set/i); assert.match(migration, /new\.warehouse_purchase_line_id/); });
test("missing or unsafe conversion remains editable manually", () => { assert.equal(referenceCostForUnit(48, { dimensionId: "weight", factorToBase: 10 }, { dimensionId: "count", factorToBase: 1 }), null); assert.match(migration, /new\.cost_base_unit_snapshot := null/); });
test("orders without stock do not generate stock", () => { assert.doesNotMatch(migration, /insert\s+into\s+public\.inventory_movements/i); assert.match(sheet, /Guardar fila/); });
test("stock is confirmed once through existing RPC, after real quantity", () => { assert.match(sheet, /confirmQbMerchandiseReceiptAction/); assert.match(card, /actualBaseQuantityRecorded/); assert.match(migration, /require_measured_warehouse_purchase_before_stock/); assert.doesNotMatch(migration, /insert\s+into\s+public\.inventory_movements/i); });
test("purchases use inline rows and a searchable product picker", () => {
  assert.match(sheet, /Agregar fila/);
  assert.match(sheet, /Seleccionar producto/);
  assert.match(sheet, /Buscar producto/);
  assert.match(sheet, /PU @-CUART-LIBRA/);
  assert.match(sheet, /Confirmar ingreso a stock/);
  assert.doesNotMatch(sheet, /Agregar compra real/);
});
test("conversion uses configured unit factors, not nominal carga", () => { assert.equal(referenceCostForUnit(48, { dimensionId: "weight", factorToBase: 10 }, { dimensionId: "weight", factorToBase: 1 }), 4.8); assert.match(migration, /v_base_unit\.conversion_factor_to_base\s*\/\s*v_reference_unit\.conversion_factor_to_base/); });
test("configured physical conversion calculates reference, presentation does not", () => {
  assert.equal(autoReferencePriceFromPurchaseUnit(28, { label: "KG", dimensionId: "weight", factorToBase: 1 }, { dimensionId: "weight", factorToBase: 0.25 }), 7);
  assert.equal(autoReferencePriceFromPurchaseUnit(280, { label: "CARGA", dimensionId: "weight", factorToBase: 10 }, { dimensionId: "weight", factorToBase: 1 }), null);
  assert.equal(autoReferencePriceFromPurchaseUnit(150, { label: "CHIPA", dimensionId: "count", factorToBase: 1 }, { dimensionId: "weight", factorToBase: 1 }), null);
});
test("manual override and missing reference remain distinguishable", () => {
  assert.match(migration, /reference_price_origin = 'calculated'/);
  assert.match(migration, /reference_price_origin is distinct from 'manual'/);
  assert.match(migration, /new\.cost_base_unit_snapshot := null/);
});
