import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const receiptUi = read(
  "src/components/qb-receipts/qb-receipts-management.tsx",
);
const receiptActions = read("src/lib/qb-receipts/actions.ts");
const rangeMigration = read(
  "supabase/migrations/20260729010200_qb_custom_receipt_factors.sql",
);
const integerMigration = read(
  "supabase/migrations/20260729010300_qb_integer_receipt_factors.sql",
);

test("the four receipt factors use unrestricted numeric percentage inputs", () => {
  for (const name of [
    "distance_factor_percent",
    "exigency_factor_percent",
    "weather_factor_percent",
    "extraordinary_factor_percent",
  ]) {
    assert.match(receiptUi, new RegExp(`name="${name}"`));
  }

  assert.match(receiptUi, /type="number"/);
  assert.match(receiptUi, /min="0"/);
  assert.match(receiptUi, /max="1000"/);
  assert.match(receiptUi, /step="1"/);
  assert.doesNotMatch(receiptUi, /step="0\.001"/);
  assert.doesNotMatch(receiptUi, /Aplicar \(5%\)/);
});

test("the server validates finite integer percentages", () => {
  assert.match(receiptActions, /\.finite\(\)/);
  assert.match(receiptActions, /\.min\(0\)/);
  assert.match(receiptActions, /\.max\(1000\)/);
  assert.match(receiptActions, /Number\.isInteger\(value\)/);
  assert.doesNotMatch(receiptActions, /value === 0 \|\| value === 5/);
});

test("the database accepts custom draft factors but keeps issued receipts immutable", () => {
  assert.match(rangeMigration, /distance_factor_percent < 0/);
  assert.match(rangeMigration, /distance_factor_percent > 1000/);
  assert.match(integerMigration, /p_value = trunc\(p_value\)/);
  assert.match(integerMigration, /old\.status <> 'borrador'/);
  assert.match(integerMigration, /recibo emitido son inmutables/);
  assert.match(
    integerMigration,
    /private\.qb_receipt_factor_is_valid\(v_receipt\.distance_factor_percent\)/,
  );
  assert.doesNotMatch(integerMigration, /not in \(0,\s*5\)/);
});
