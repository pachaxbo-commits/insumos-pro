import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const dialog = read("src/components/products/new-product-dialog.tsx");
const helper = read("src/lib/products/weight-control.ts");
const migration = read(
  "supabase/migrations/20260812010100_qb_fresh_product_actual_weight_defaults.sql",
);
const numberedCategoryFix = read(
  "supabase/migrations/20260812010200_qb_numbered_fresh_category_weight_fix.sql",
);
const matrix = read("src/components/operational-matrix/operational-matrix.tsx");

test("frutas y verduras frescas activan peso real por defecto", () => {
  assert.match(helper, /"frutas frescas"/);
  assert.match(helper, /"verduras"/);
  assert.match(helper, /replace\(\/\^\\d\+\\s\+\//);
  assert.match(dialog, /usesActualWeightByDefault/);
  assert.match(dialog, /setControlsActualWeight/);
  assert.match(migration, /'FRUTAS FRESCAS', 'VERDURAS'/);
  assert.match(migration, /controls_actual_weight = true/);
  assert.match(numberedCategoryFix, /regexp_replace/);
  assert.match(numberedCategoryFix, /\[0-9\]\+\[\[:space:\]\]\+/);
  assert.match(numberedCategoryFix, /controls_actual_weight = true/);
});

test("la tarifa por peso sigue siendo una parametrización explícita", () => {
  assert.doesNotMatch(migration, /base_sale_price\s*=/);
  assert.doesNotMatch(migration, /base_price_unit_id\s*=/);
  assert.doesNotMatch(numberedCategoryFix, /base_sale_price\s*=/);
  assert.match(matrix, /configura un precio por unidad de peso/);
});
