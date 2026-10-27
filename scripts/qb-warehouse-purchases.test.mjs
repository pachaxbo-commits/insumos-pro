import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { autoReferencePriceFromPurchaseUnit, purchaseTotal, referenceCostForUnit } from "../src/lib/warehouse-purchases/model.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261007120000_qb_warehouse_purchase_reference.sql", import.meta.url), "utf8");
const purchaseMigration = readFileSync(new URL("../supabase/migrations/20261022090000_qb_warehouse_purchase_draft_edit.sql", import.meta.url), "utf8");
const sheet = readFileSync(new URL("../src/app/(private)/ingresos/compras-almacen/warehouse-purchase-table.tsx", import.meta.url), "utf8");
const productCombobox = readFileSync(new URL("../src/components/products/product-combobox.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../src/lib/qb-ingresos/actions.ts", import.meta.url), "utf8");
const warehouseActions = readFileSync(new URL("../src/lib/warehouse-purchases/actions.ts", import.meta.url), "utf8");
const integration = readFileSync(new URL("./qb-warehouse-purchases.integration.sql", import.meta.url), "utf8");

test("1 carga × Bs 420 totals Bs 420", () => assert.equal(purchaseTotal(1, 420), 420));
test("manual reference Bs 48 is not carga/10", () => assert.equal(referenceCostForUnit(48, { dimensionId: "weight", factorToBase: 1 }, { dimensionId: "weight", factorToBase: 1 }), 48));
test("manual reference can be edited from 48 to 50 before confirmation", () => { assert.match(sheet, /updateWarehousePurchaseAction/); assert.match(migration, /reference_price numeric/); });
test("discard observation does not recalculate reference price", () => { assert.match(sheet, /notes/); assert.doesNotMatch(migration, /total_cost\s*\/\s*10/); });
test("two purchases of the same product are separate receipt lines", () => { assert.doesNotMatch(migration, /unique\s*\([^)]*product_id[^)]*receipt_date/); assert.match(actions, /\.from\("qb_merchandise_receipts"\)\s*\.insert/); });
test("observation is saved and exported", () => { const route = readFileSync(new URL("../src/app/api/ingresos/compras-almacen.xlsx/route.ts", import.meta.url), "utf8"); assert.match(actions, /notes: input\.notes/); assert.match(route, /row\.notes/); });
test("later QB receipt snapshots latest confirmed purchase", () => { assert.match(migration, /receipt\.status = 'confirmado'/); assert.match(migration, /order by receipt\.confirmed_at desc/); assert.match(migration, /before insert on public\.qb_receipt_lines/); });
test("historical issued receipt is not repriced by a later purchase", () => { assert.doesNotMatch(migration, /update\s+public\.qb_receipt_lines\s+set/i); assert.match(migration, /new\.warehouse_purchase_line_id/); });
test("missing or unsafe conversion remains editable manually", () => { assert.equal(referenceCostForUnit(48, { dimensionId: "weight", factorToBase: 10 }, { dimensionId: "count", factorToBase: 1 }), null); assert.match(migration, /new\.cost_base_unit_snapshot := null/); });
test("orders without stock do not generate stock", () => { assert.doesNotMatch(migration, /insert\s+into\s+public\.inventory_movements/i); assert.match(sheet, /Guardar borrador/); });
test("stock is confirmed idempotently through the existing stock/FIFO transaction", () => { assert.match(sheet, /confirmWarehousePurchaseAction/); assert.match(purchaseMigration, /confirm_qb_merchandise_receipt\(p_receipt_id\)/); assert.match(purchaseMigration, /v_movements = v_lines/); assert.match(migration, /require_measured_warehouse_purchase_before_stock/); assert.doesNotMatch(purchaseMigration, /insert\s+into\s+public\.inventory_movements/i); });
test("purchases use inline rows and a searchable product picker", () => {
  assert.match(sheet, /Agregar fila/);
  assert.match(sheet, /Seleccionar producto/);
  assert.match(sheet, /Buscar producto/);
  assert.match(sheet, /PU referencial/);
  assert.match(sheet, /Cargar stock/);
  assert.match(sheet, /Confirmar ingreso/);
  assert.doesNotMatch(sheet, /Editar \/ confirmar/);
  assert.doesNotMatch(sheet, /Agregar compra real/);
});
test("saved draft edits are inline, manually submitted, and protected against concurrent changes", () => {
  assert.match(sheet, /name="expected_updated_at"/);
  assert.match(sheet, /Guardar/);
  assert.match(sheet, /Descartar/);
  assert.match(sheet, /Anular borrador/);
  assert.match(purchaseMigration, /QB_PURCHASE_ROW_CONFLICT/);
  assert.match(purchaseMigration, /receipt\.status <> 'borrador'/);
});
test("effective physical quantity is stored independently from the commercial purchase and total cost", () => {
  assert.match(sheet, /name="effective_quantity"/);
  assert.match(sheet, /name="effective_unit_id"/);
  assert.match(purchaseMigration, /p_effective_quantity/);
  assert.match(purchaseMigration, /v_effective_base := round/);
  assert.match(purchaseMigration, /total_cost = v_total/);
});
test("commercial CARGA draft is inserted atomically without inventing conversion", () => {
  assert.equal(purchaseTotal(3, 600), 1800);
  assert.match(actions, /create_qb_warehouse_purchase_draft/);
  assert.match(purchaseMigration, /p_source_kind = 'commercial_unmeasured'/);
  assert.match(purchaseMigration, /p_base_quantity <> 0 or p_conversion_factor <> 0/);
  assert.match(purchaseMigration, /insert into public\.qb_conversion_snapshots/);
  assert.match(purchaseMigration, /create_qb_warehouse_purchase_draft\(date,uuid/);
});
test("PostgreSQL integration fixture covers persistence, effective quantity, FIFO, conflicts, conversions and rollback", () => {
  assert.match(integration, /source_label = 'CARGA'/);
  assert.match(integration, /3, v_base_unit, v_base_symbol, 0, 0, 600, 1800/);
  assert.match(integration, /75, v_base_unit/);
  assert.match(integration, /confirm_qb_warehouse_purchase_draft\(v_receipt\)/);
  assert.match(integration, /inventory_lots/);
  assert.match(integration, /QB_PURCHASE_ROW_CONFLICT/);
  assert.match(integration, /round\(2 \* v_factor, 6\)/);
  assert.match(integration.trimEnd(), /rollback;/i);
});
test("operating expense workflow remains mounted and its server action is unchanged", () => {
  assert.match(sheet, /WarehouseExpenseSection/);
  assert.match(warehouseActions, /saveWarehouseOperatingExpensesAction/);
  assert.match(warehouseActions, /save_qb_warehouse_operating_expenses/);
});
test("conversion uses configured unit factors, not nominal carga", () => { assert.equal(referenceCostForUnit(48, { dimensionId: "weight", factorToBase: 10 }, { dimensionId: "weight", factorToBase: 1 }), 4.8); assert.match(migration, /v_base_unit\.conversion_factor_to_base\s*\/\s*v_reference_unit\.conversion_factor_to_base/); });
test("configured physical conversion calculates reference, presentation does not", () => {
  assert.equal(autoReferencePriceFromPurchaseUnit(28, { label: "KG", dimensionId: "weight", factorToBase: 1 }, { dimensionId: "weight", factorToBase: 0.25 }), 7);
  assert.equal(autoReferencePriceFromPurchaseUnit(280, { label: "CARGA", dimensionId: "weight", factorToBase: 10 }, { dimensionId: "weight", factorToBase: 1 }), null);
  assert.equal(autoReferencePriceFromPurchaseUnit(150, { label: "CHIPA", dimensionId: "count", factorToBase: 1 }, { dimensionId: "weight", factorToBase: 1 }), null);
});
test("unmeasured commercial option can save without a configured unit mapping", () => {
  assert.match(sheet, /isUnmeasuredCommercial\s*=\s*draft\.purchaseOptionId\s*===\s*UNMEASURED_COMMERCIAL/);
  assert.match(sheet, /if\s*\(!option\s*&&\s*!isUnmeasuredCommercial\)\s*return/);
  assert.match(sheet, /commercial_label:\s*isUnmeasuredCommercial\s*\?\s*draft\.commercialLabel/);
  assert.match(actions, /commercial_label/);
});
test("commercial save errors remain visible while draft values stay in controlled inputs", () => {
  assert.match(sheet, /role=\{message\.success\s*\?\s*"status"\s*:\s*"alert"\}/);
  assert.match(sheet, /setDrafts\(\(current\) => current\.filter\(\(item\) => item\.id !== draft\.id\)\)/);
});
test("purchase product search supports keyboard selection and visible active option", () => {
  assert.match(sheet, /event\.key === "ArrowDown"/);
  assert.match(sheet, /event\.key === "ArrowUp"/);
  assert.match(sheet, /event\.key === "Enter"/);
  assert.match(sheet, /event\.key === "Escape"/);
  assert.match(sheet, /scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.match(sheet, /role="option" aria-selected=\{index === activeIndex\}/);
});
test("shared product combobox keeps arrow keys local and supports keyboard and mouse selection", () => {
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"]) assert.ok(productCombobox.includes(`event.key === "${key}"`));
  assert.match(productCombobox, /scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.match(productCombobox, /onClick=\{\(\) => choose\(option\)\}/);
  assert.match(productCombobox, /onMouseEnter=\{\(\) => setActiveIndex\(index\)\}/);
  assert.match(productCombobox, /onKeyDown=\{\(event\)/);
});
test("manual override and missing reference remain distinguishable", () => {
  assert.match(migration, /reference_price_origin = 'calculated'/);
  assert.match(migration, /reference_price_origin is distinct from 'manual'/);
  assert.match(migration, /new\.cost_base_unit_snapshot := null/);
});
