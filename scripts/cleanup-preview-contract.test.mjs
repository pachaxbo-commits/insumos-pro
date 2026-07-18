import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const preview = readFileSync(
  "scripts/production-close/cleanup-preview.sql",
  "utf8",
);
const executableSql = preview
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

test("cleanup preview is strictly read only", () => {
  assert.doesNotMatch(executableSql, /\b(delete|update|truncate|drop|alter|insert)\b/i);
  assert.match(executableSql, /array\[\]::uuid\[\]/);
  assert.match(executableSql, /null::date as cutoff_date/);
});

test("cleanup preview enumerates dependencies and protects the catalog", () => {
  for (const table of [
    "qb_order_items",
    "qb_order_preparations",
    "qb_order_delivery_movements",
    "qb_merchandise_receipt_lines",
    "qb_receipt_orders",
    "qb_receipt_lines",
    "qb_customer_locations",
  ]) {
    assert.match(preview, new RegExp(table));
  }
  assert.match(preview, /catalog_master_candidates', 0::bigint/);
});
