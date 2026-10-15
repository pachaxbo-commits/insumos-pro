import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { getWarehousePurchaseUnits } from "../src/lib/warehouse-purchases/allowed-units.ts";

const productId = "p-1";
const allowed = [
  { id: "kg-map", productId, context: "recepcion", unitId: "kg", presentationId: null, isActive: true },
  { id: "lb-map", productId, context: "recepcion", unitId: "lb", presentationId: null, isActive: true },
  { id: "pack-map", productId, context: "recepcion", unitId: null, presentationId: "pack", isActive: true },
  { id: "inactive-map", productId, context: "recepcion", unitId: "inactive-unit", presentationId: null, isActive: false },
  { id: "wrong-context", productId, context: "pedido", unitId: "kg", presentationId: null, isActive: true },
  { id: "bad-pack-map", productId, context: "recepcion", unitId: null, presentationId: "bad-pack", isActive: true },
];
const units = [
  { id: "kg", dimensionId: "weight", dimensionCode: "weight", symbol: "KG", factorToBase: 1, isActive: true },
  { id: "lb", dimensionId: "weight", dimensionCode: "weight", symbol: "LB", factorToBase: 0.45359237, isActive: true },
  { id: "inactive-unit", dimensionId: "weight", dimensionCode: "weight", symbol: "INACTIVE", factorToBase: 1, isActive: false },
  { id: "unit", dimensionId: "count", dimensionCode: "count", symbol: "UN", factorToBase: 1, isActive: true },
  { id: "legacy-kg", dimensionId: "legacy", dimensionCode: "legacy_dump", symbol: "KG", factorToBase: 1, isActive: true },
  { id: "legacy-arroba", dimensionId: "legacy", dimensionCode: "legacy_dump", symbol: "ARROBA", factorToBase: 1, isActive: true },
  { id: "currency", dimensionId: "money", dimensionCode: "money", symbol: "BS", factorToBase: 1, isActive: true },
];
const presentations = [
  { id: "pack", productId, baseUnitId: "kg", baseQuantity: 1, conversionFactorToBase: 1, isActive: true, allowPurchase: true },
  { id: "bad-pack", productId, baseUnitId: "legacy-arroba", baseQuantity: 1, conversionFactorToBase: 1, isActive: true, allowPurchase: true },
];
const args = {
  productId, baseUnitId: "kg", baseDimensionId: "weight", baseDimensionCode: "weight", baseFactorToBase: 1,
  allowedUnits: allowed, units, presentations,
};

test("purchase choices include compatible catalog units and explicitly configured presentations", () => {
  const choices = getWarehousePurchaseUnits(args);
  assert.deepEqual(choices.map((item) => item.id), ["unit:kg", "unit:lb", "presentation:pack"]);
  assert.equal(choices[0]?.allowedUnitId, "kg-map");
  assert.deepEqual(getWarehousePurchaseUnits({ ...args, baseUnitId: "unit", baseDimensionId: "count", baseDimensionCode: "count" }).map((item) => item.id), ["unit:unit"]);
});

test("legacy dimensions expose only their exact inventory unit and safe exact-base presentations", () => {
  const choices = getWarehousePurchaseUnits({
    ...args, baseUnitId: "legacy-kg", baseDimensionId: "legacy", baseDimensionCode: "legacy_dump",
    allowedUnits: [
      ...allowed,
      { id: "legacy-map", productId, context: "recepcion", unitId: "legacy-arroba", presentationId: null, isActive: true },
      { id: "safe-legacy-presentation", productId, context: "recepcion", unitId: null, presentationId: "safe-legacy-pack", isActive: true },
    ],
    presentations: [
      ...presentations,
      { id: "safe-legacy-pack", productId, baseUnitId: "legacy-kg", baseQuantity: 1, conversionFactorToBase: 1, isActive: true, allowPurchase: true },
    ],
  });
  assert.deepEqual(choices.map((item) => item.id), ["unit:legacy-kg", "presentation:safe-legacy-pack"]);
});

test("selector excludes inactive, wrong-context, unsafe, currency, and malformed factors", () => {
  const choices = getWarehousePurchaseUnits({
    ...args,
    allowedUnits: [...allowed, { id: "nan-map", productId, context: "recepcion", unitId: "nan", presentationId: null, isActive: true }],
    units: [...units, { id: "nan", dimensionId: "weight", dimensionCode: "weight", symbol: "NAN", factorToBase: Number.NaN, isActive: true }],
  });
  assert.deepEqual(choices.map((item) => item.id), ["unit:kg", "unit:lb", "presentation:pack"]);
});

test("missing or invalid physical inventory base yields no purchase options", () => {
  assert.deepEqual(getWarehousePurchaseUnits({ ...args, baseUnitId: null }), []);
  assert.deepEqual(getWarehousePurchaseUnits({ ...args, baseDimensionId: null }), []);
  assert.deepEqual(getWarehousePurchaseUnits({ ...args, baseFactorToBase: 0 }), []);
});

test("selected catalog unit uses scoped audited RPC and server rejects legacy cross-unit conversion", async () => {
  const action = await readFile(new URL("../src/lib/qb-ingresos/actions.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/20261015100000_qb_guard_legacy_purchase_unit_conversion.sql", import.meta.url), "utf8");
  assert.match(action, /ensure_qb_reception_unit_for_purchase/);
  assert.match(action, /p_product_id: input\.product_id, p_unit_id: input\.purchase_unit_id/);
  assert.match(action, /dimensionCode === "legacy_dump" && purchaseUnit\.id !== baseUnit\.id/);
  assert.match(action, /dimensionCode === "legacy_dump" && sourceUnit\.id !== baseUnit\.id/);
  assert.match(migration, /v_dimension_code = 'legacy_dump' and p_unit_id is distinct from v_base_unit_id/);
  assert.doesNotMatch(action, /from\("qb_product_allowed_units"\)\s*\.insert\(/);
});
