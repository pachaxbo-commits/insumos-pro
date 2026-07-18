import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("price template has 31 backed rows and no invented new prices", () => {
  const rows = read("data/templates/qb_product_prices_template.csv").trim().split(/\r?\n/);
  assert.equal(rows.length - 1, 31);
  for (const row of rows.slice(1)) {
    assert.match(row, /,"[^"]*",,"","true",""$/);
  }
});

test("receiving template leaves every unconfirmed factor blank", () => {
  const rows = read("data/templates/qb_receiving_conversions_template.csv").trim().split(/\r?\n/);
  assert.equal(rows.length - 1, 316);
  for (const row of rows.slice(1)) {
    const fields = row.split('","').map((value) => value.replace(/^"|"$/g, ""));
    assert.equal(fields[6], "");
    assert.match(fields[7], /^[CD] - /);
  }
});

test("initial stock template contains no invented quantity or date", () => {
  const rows = read("data/templates/qb_initial_stock_template.csv").trim().split(/\r?\n/);
  assert.equal(rows.length - 1, 197);
  for (const row of rows.slice(1)) {
    const fields = row.split('","').map((value) => value.replace(/^"|"$/g, ""));
    assert.equal(fields[4], "");
    assert.equal(fields[5], "");
  }
});

test("public catalog contract never returns the internal base price", () => {
  const migration = read("supabase/migrations/20260712092300_qb17_amount_based_orders.sql");
  const catalogReturn = migration.slice(migration.indexOf("create or replace function public.get_qb17_public_catalog"));
  assert.doesNotMatch(catalogReturn, /base_sale_price\s+as/i);
  assert.match(catalogReturn, /amount_bs_available/i);
});

test("price action is administrator-only and uses the guarded RPC", () => {
  const actions = read("src/lib/products/actions.ts");
  assert.match(actions, /auth\.user\.role !== "administrador"/);
  assert.match(actions, /rpc\("update_qb_product_base_price"/);
  assert.match(actions, /confirm_replacement/);
});
