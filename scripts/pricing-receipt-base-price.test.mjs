import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const receiptUi = read("src/components/qb-receipts/qb-receipts-management.tsx");
const receiptActions = read("src/lib/qb-receipts/actions.ts");
const receiptData = read("src/lib/qb-receipts/data.ts");
const productUi = read("src/components/products/qb-product-price-management.tsx");
const productActions = read("src/lib/products/actions.ts");
const activationUi = read("src/components/operational-activation/operational-activation-manager.tsx");
const migration = read("supabase/migrations/20260712092600_receipt_base_price_management.sql");
const guardedRpc = read("supabase/migrations/20260712092400_qb17_operational_price_management.sql");
const publicCatalog = read("src/lib/qb-catalog/data.ts");

test("1. receipt explains a missing base price and offers an explicit choice", () => {
  assert.match(receiptUi, /Este producto todavía no tiene precio base/);
  assert.match(receiptUi, /Guardar este precio como precio base para próximos[\s\S]*pedidos/);
});

test("2. saving from a receipt delegates to the guarded price RPC", () => {
  assert.match(migration, /perform public\.update_qb_product_base_price\(/);
  assert.doesNotMatch(migration, /set base_sale_price\s*=/);
});

test("3. leaving the choice unchecked keeps a receipt-only price", () => {
  assert.match(receiptUi, /Precio excepcional: se usará solo en este recibo/);
  assert.match(receiptUi, /saveAsNewBasePrice:[\s\S]{0,160}draft\.saveAsNewBasePrice/);
});

test("4. matching prices do not trigger a redundant update", () => {
  assert.match(receiptUi, /El precio aplicado ya coincide con el precio base/);
  assert.match(migration, /if v_current_price is distinct from v_line_price then/);
});

test("5. replacing a different price requires an explicit confirmation", () => {
  assert.match(receiptUi, /Confirmas reemplazar/);
  assert.match(receiptUi, /checked=\{draft\.saveAsNewBasePrice\}/);
});

test("6. the current base price is loaded separately from the receipt snapshot", () => {
  assert.match(receiptData, /from\("qb_product_unit_settings"\)/);
  assert.match(receiptData, /currentBasePrice:/);
  assert.match(receiptUi, /line\.currentBasePrice/);
});

test("7. receipt snapshots are not rewritten by the corrective migration", () => {
  assert.doesNotMatch(migration, /update\s+private\.qb_order_amount_snapshots/i);
  assert.doesNotMatch(migration, /delete\s+from\s+private\.qb_order_amount_snapshots/i);
});

test("8. new amount-based orders continue to use the current server price", () => {
  assert.match(read("supabase/migrations/20260712092300_qb17_amount_based_orders.sql"), /settings\.base_sale_price/);
});

test("9. inventory users cannot change a base price", () => {
  assert.match(guardedRpc, /v_role not in \('admin', 'administrador'\)/);
  assert.match(productActions, /assertCanManageBasePrices/);
});

test("10. the public catalog does not request or expose the internal base price", () => {
  assert.doesNotMatch(publicCatalog, /base_sale_price/);
  assert.match(guardedRpc, /revoke all on function public\.update_qb_product_base_price/);
});

test("11. save errors remain in the receipt draft flow with professional messages", () => {
  assert.match(receiptActions, /QB_PRICE_CONCURRENT_CHANGE/);
  assert.match(receiptActions, /El precio base cambió mientras editabas/);
  assert.match(receiptActions, /return initialFailure\(receiptUpdateErrorMessage\(error\)\)/);
});

test("12. Products supports search, update, removal and clear operational states", () => {
  assert.match(productUi, /Buscar producto/);
  assert.match(productUi, /Retirar precio/);
  for (const label of ["Habilitado", "Falta precio", "Unidad inválida", "No respaldado por BS"]) {
    assert.ok(productUi.includes(label));
  }
});

test("13. price management does not update stock or inventory movements", () => {
  assert.doesNotMatch(migration, /stock_current\s*=/);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.inventory_movements/i);
});

test("14. advanced templates remain available and explain their intended use", () => {
  assert.match(activationUi, /Para configurar pocos productos, utiliza Productos o guarda el precio desde un recibo/);
  assert.match(activationUi, /Usa esta plantilla únicamente para cargas masivas/);
});

test("15. receipt base price advances in half-unit steps", () => {
  assert.match(receiptUi, /min="0\.5"/);
  assert.match(receiptUi, /step="0\.5"/);
  assert.match(
    receiptUi,
    /aria-label=\{`Precio aplicado para \$\{line\.productName\}`\}[\s\S]{0,180}step="0\.5"/,
  );
});
