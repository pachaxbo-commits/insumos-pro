import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { getWarehousePurchaseUnits } from "../src/lib/warehouse-purchases/allowed-units.ts";

const productId = "p-1";
const allowed = [
  { id: "kg", productId, context: "recepcion", unitId: "kg", presentationId: null, isActive: true },
  { id: "unit", productId, context: "recepcion", unitId: "unit", presentationId: null, isActive: true },
  { id: "envelope", productId, context: "recepcion", unitId: "envelope", presentationId: null, isActive: true },
  { id: "liter", productId, context: "recepcion", unitId: "liter", presentationId: null, isActive: true },
  { id: "money", productId, context: "recepcion", unitId: "money", presentationId: null, isActive: true },
  { id: "presentation", productId, context: "recepcion", unitId: null, presentationId: "pack", isActive: true },
  { id: "inactive", productId, context: "recepcion", unitId: "kg", presentationId: null, isActive: false },
  { id: "order-only", productId, context: "pedido", unitId: "kg", presentationId: null, isActive: true },
  { id: "bad-presentation", productId, context: "recepcion", unitId: null, presentationId: "not-purchase", isActive: true },
  { id: "ambiguous", productId, context: "recepcion", unitId: "kg", presentationId: "pack", isActive: true },
  { id: "other-product", productId: "p-2", context: "recepcion", unitId: "kg", presentationId: null, isActive: true },
];
const units = [
  { id: "kg", dimensionId: "weight", symbol: "KG", isActive: true },
  { id: "unit", dimensionId: "count", symbol: "UN", isActive: true },
  { id: "envelope", dimensionId: "count", symbol: "SOBRE", isActive: true },
  { id: "liter", dimensionId: "volume", symbol: "L", isActive: true },
  { id: "money", dimensionId: "money", symbol: "BS", isActive: true },
  { id: "inactive-unit", dimensionId: "weight", symbol: "KG", isActive: false },
  { id: "pack-base", dimensionId: "weight", symbol: "KG", isActive: true },
  { id: "other-dimension", dimensionId: "weight", symbol: "KG", isActive: true },
];
const presentations = [
  { id: "pack", productId, baseUnitId: "pack-base", isActive: true, allowPurchase: true },
  { id: "not-purchase", productId, baseUnitId: "pack-base", isActive: true, allowPurchase: false },
];

test("purchase choices include compatible catalog units and configured presentations", () => {
  const choices = getWarehousePurchaseUnits({ productId, baseDimensionId: "weight", allowedUnits: allowed, units, presentations });
  assert.deepEqual(choices.map((item) => item.id), ["unit:pack-base", "unit:other-dimension", "presentation:pack"]);
  assert.equal(choices[0]?.allowedUnitId, null);
  assert.deepEqual(getWarehousePurchaseUnits({ productId, baseDimensionId: "count", allowedUnits: allowed, units, presentations }).map((item) => item.id), ["unit:unit", "unit:envelope"]);
  assert.deepEqual(getWarehousePurchaseUnits({ productId, baseDimensionId: "volume", allowedUnits: allowed, units, presentations }).map((item) => item.id), ["unit:liter"]);
});

test("unit selector excludes inactive, wrong-context, incompatible, ambiguous, and other-product mappings", () => {
  const choices = getWarehousePurchaseUnits({ productId, baseDimensionId: "count", allowedUnits: allowed, units, presentations });
  assert.equal(choices.some((item) => ["unit:inactive-unit", "presentation:not-purchase", "order-only", "bad-presentation", "ambiguous", "other-product"].includes(item.id)), false);
  assert.equal(choices.some((item) => item.id === "money"), false);
});

test("missing physical inventory dimension yields no purchase options", () => {
  assert.deepEqual(getWarehousePurchaseUnits({ productId, baseDimensionId: null, allowedUnits: allowed, units, presentations }), []);
  assert.deepEqual(getWarehousePurchaseUnits({ productId, baseDimensionId: "money", allowedUnits: allowed, units, presentations }), []);
});

test("selecting a catalog unit uses the scoped, audited server RPC", async () => {
  const action = await readFile(new URL("../src/lib/qb-ingresos/actions.ts", import.meta.url), "utf8");
  assert.match(action, /ensure_qb_reception_unit_for_purchase/);
  assert.match(action, /p_product_id: input\.product_id, p_unit_id: input\.purchase_unit_id/);
  assert.doesNotMatch(action, /from\("qb_product_allowed_units"\)\s*\.insert\(/);
});
