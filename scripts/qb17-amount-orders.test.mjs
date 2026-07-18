import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260712092300_qb17_amount_based_orders.sql",
  "utf8",
);
const catalog = readFileSync(
  "src/components/catalog/public-catalog.tsx",
  "utf8",
);
const checkout = readFileSync(
  "src/components/catalog/public-checkout.tsx",
  "utf8",
);
const guest = readFileSync("src/lib/qb-catalog/guest-actions.ts", "utf8");
const registered = readFileSync("src/lib/qb-catalog/actions.ts", "utf8");
const internal = readFileSync("src/lib/qb-orders/actions.ts", "utf8");
const preparation = readFileSync(
  "src/components/qb-orders/qb-orders-management.tsx",
  "utf8",
);
const repeat = readFileSync(
  "src/components/customer-account/customer-portal.tsx",
  "utf8",
);
const receipt = readFileSync(
  "src/components/qb-receipts/receipt-document.tsx",
  "utf8",
);

test("BS is never created as a physical unit", () => {
  assert.doesNotMatch(
    migration,
    /insert\s+into\s+public\.qb_units[\s\S]*['\"]bs['\"]/i,
  );
});

test("public catalog exposes only an availability boolean", () => {
  const publicFunction = migration.slice(
    migration.indexOf(
      "create or replace function public.get_qb17_public_catalog",
    ),
  );
  assert.match(publicFunction, /amount_bs_available boolean/);
  assert.doesNotMatch(
    publicFunction.match(/returns table \([\s\S]*?\)\s*language sql/)?.[0] ??
      "",
    /price/i,
  );
});

test("critical price and factor are resolved on the server", () => {
  assert.match(migration, /settings\.base_sale_price/);
  assert.match(migration, /pricing_unit\.conversion_factor_to_base/);
  assert.match(
    migration,
    /v_estimated_quantity := pg_catalog\.round\(v_amount \/ v_price, 3\)/,
  );
  assert.match(migration, /v_estimated_base := pg_catalog\.round/);
});

test("price snapshots remain private and ungranted", () => {
  assert.match(migration, /private\.qb_order_amount_snapshots/);
  assert.match(
    migration,
    /revoke all on table private\.qb_order_amount_snapshots from public, anon, authenticated/,
  );
});

test("registered guest and internal calls use QB-17 wrappers", () => {
  assert.match(registered, /create_qb17_catalog_order/);
  assert.match(guest, /create_qb17_guest_catalog_order/);
  assert.match(internal, /create_qb17_internal_catalog_order/);
});

test("client payload never sends authoritative price or factor", () => {
  for (const source of [registered, guest, internal]) {
    const payloadArea =
      source.match(/p_items:[\s\S]*?p_idempotency_key/)?.[0] ?? source;
    assert.doesNotMatch(
      payloadArea,
      /price_base_snapshot|conversion_factor_snapshot/,
    );
  }
});

test("catalog supports quantity and amount modes without showing price", () => {
  assert.match(catalog, /Por cantidad/);
  assert.match(catalog, /Por importe en Bs/);
  assert.doesNotMatch(catalog, /base_sale_price|Precio base/);
});

test("checkout preserves the original amount", () => {
  assert.match(checkout, /requestedAmountBs/);
  assert.match(checkout, /Solicitado por importe/);
});

test("preparation shows amount and physical estimate", () => {
  assert.match(preparation, /Pedido: Bs/);
  assert.match(preparation, /Preparar aproximadamente/);
  assert.match(preparation, /actualQuantity/);
});

test("repeat keeps amount intent and requests a new server calculation", () => {
  assert.match(repeat, /inputMode: "amount_bs"/);
  assert.match(repeat, /requestedAmountBs: item\.requestedAmountBs/);
  assert.doesNotMatch(repeat, /priceBaseSnapshot|conversionFactorSnapshot/);
});

test("customer receipt export does not render internal snapshots", () => {
  assert.doesNotMatch(
    receipt,
    /priceBaseSnapshot|conversionFactorSnapshot|qb_order_amount_snapshots/,
  );
});

test("SQL contract has 31 numbered scenarios and ends in rollback", () => {
  const contract = readFileSync(
    "supabase/tests/qb17_amount_orders_sql_contract.sql",
    "utf8",
  );
  const scenarios = [
    ...contract.matchAll(/insert into qb17_contract_results values \((\d+),/g),
  ].map((match) => Number(match[1]));
  assert.deepEqual(
    scenarios,
    Array.from({ length: 31 }, (_, index) => index + 1),
  );
  assert.match(contract.trimEnd(), /rollback;$/i);
});
