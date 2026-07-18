import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260712093100_qb_pilot_stock_amount_contract.sql",
  "utf8",
);
const settings = readFileSync(
  "src/components/inventory/stock-control-settings.tsx",
  "utf8",
);
const banner = readFileSync(
  "src/components/inventory/stock-control-banner.tsx",
  "utf8",
);
const products = readFileSync(
  "src/components/products/product-amount-mode-control.tsx",
  "utf8",
);
const orders = readFileSync(
  "src/components/qb-orders/qb-orders-management.tsx",
  "utf8",
);
const receipts = readFileSync(
  "src/components/qb-receipts/qb-receipts-management.tsx",
  "utf8",
);
const catalog = readFileSync(
  "src/components/catalog/public-catalog.tsx",
  "utf8",
);

test("strict stock starts disabled without overwriting an existing choice", () => {
  assert.match(
    migration,
    /strict_stock_control boolean not null default false/,
  );
  assert.match(migration, /on conflict \(id\) do nothing/);
});

test("only administrators may change global stock mode", () => {
  assert.match(migration, /QB_STOCK_ADMIN_REQUIRED/);
  assert.match(migration, /v_role not in \('admin', 'administrador'\)/);
});

test("strict activation requires exact explicit confirmation", () => {
  assert.match(migration, /ACTIVAR CONTROL ESTRICTO/);
  assert.match(settings, /confirmation/);
});

test("activation preview exposes the four required counts", () => {
  for (const key of [
    "negative_products",
    "products_without_base_unit",
    "products_without_opening_stock",
    "pending_regularization",
  ]) {
    assert.match(migration, new RegExp(key));
  }
});

test("strict delivery locks stock and reports available and missing quantities", () => {
  assert.match(migration, /strict_stock_control into v_strict/);
  assert.match(migration, /from public\.products product[\s\S]*for update/);
  assert.match(
    migration,
    /QB_STOCK_INSUFFICIENT: Existencia disponible:[\s\S]*Faltante:/,
  );
});

test("pilot delivery still records the real quantity and allows negative stock", () => {
  assert.match(
    migration,
    /v_stock_after := v_stock_before - v_item\.actual_base_quantity/,
  );
  assert.match(migration, /'salida', v_item\.actual_base_quantity/);
});

test("double delivery guard remains in the canonical function", () => {
  assert.match(
    migration,
    /qb_order_delivery_movements[\s\S]*ya tiene descuento de stock/,
  );
});

test("amount mode is changed only through an administrator RPC", () => {
  assert.match(migration, /set_qb_product_amount_mode/);
  assert.match(migration, /QB_AMOUNT_ADMIN_REQUIRED/);
  assert.match(products, /setQbProductAmountModeAction/);
});

test("amount mode validates sellability, units, price and order allowance", () => {
  for (const code of [
    "QB_AMOUNT_NOT_SELLABLE",
    "QB_AMOUNT_RECEIVING_ONLY",
    "QB_AMOUNT_BASE_UNIT_REQUIRED",
    "QB_AMOUNT_PRICE_UNIT_REQUIRED",
    "QB_AMOUNT_PRICE_REQUIRED",
    "QB_AMOUNT_CONVERSION_INVALID",
    "QB_AMOUNT_ORDER_UNIT_REQUIRED",
  ]) {
    assert.match(migration, new RegExp(code));
  }
});

test("no real product is automatically enabled by the pilot migration", () => {
  assert.doesNotMatch(
    migration,
    /update public\.qb_product_unit_settings[\s\S]{0,100}supports_amount_bs\s*=\s*true/i,
  );
});

test("receipt amount lines have an explicit fixed monetary contract", () => {
  assert.match(migration, /fixed_line_amount numeric\(18, 2\)/);
  assert.match(migration, /fixed_line_amount = requested_amount_bs/);
  assert.match(migration, /line_total = fixed_line_amount/);
});

test("receipt trigger derives amount fields from the private order snapshot", () => {
  assert.match(migration, /private\.qb_order_amount_snapshots/);
  assert.match(migration, /snapshot\.price_base_snapshot/);
  assert.match(migration, /snapshot\.currency_snapshot/);
});

test("receipt recalculation never applies factors to an amount line", () => {
  assert.match(
    migration,
    /when line\.order_input_mode = 'amount_bs' then line\.fixed_line_amount/,
  );
  assert.doesNotMatch(
    migration,
    /when line\.order_input_mode = 'amount_bs' then public\.qb_compound_unit_price/,
  );
});

test("receipt UI locks amount pricing and explains the snapshot", () => {
  assert.match(
    receipts,
    /Importe fijo; la cantidad real solo afecta inventario/,
  );
  assert.match(receipts, /precio y el importe quedan conservados por snapshot/);
});

test("preparation shows requested amount, estimate, reference and real quantity", () => {
  assert.match(orders, /Pedido: Bs/);
  assert.match(orders, /Preparar aproximadamente/);
  assert.match(orders, /Precio de referencia/);
  assert.match(orders, /Cantidad real/);
});

test("significant difference warning is informational and keeps the amount", () => {
  assert.match(orders, />=\s*0\.1/);
  assert.match(orders, /el importe solicitado no cambiará/);
});

test("global setting and product mode updates use Realtime only to refresh truth", () => {
  assert.match(banner, /qb_operational_settings/);
  assert.match(banner, /router\.refresh/);
  assert.match(catalog, /qb_product_unit_settings/);
  assert.match(catalog, /router\.refresh/);
});

test("customer-facing labels distinguish provisional and strict operation", () => {
  assert.match(banner, /Modo piloto — Stock provisional/);
  assert.match(banner, /Control de stock activo/);
});
