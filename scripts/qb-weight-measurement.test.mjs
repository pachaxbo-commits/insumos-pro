import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWeightMeasurementSnapshot, formatWeightMeasurement } from "../src/lib/operational-matrix/weight-measurement.ts";
import { normalizeReferenceCost } from "../src/lib/qb-receipts/unit-cost-normalization.ts";

const lb = { id: "lb-unit", symbol: "LB", kilograms: 0.45359237 };
const snapshot = createWeightMeasurementSnapshot(12, lb);
assert.deepEqual(snapshot, {
  value: 12,
  unitId: "lb-unit",
  factorToKg: 0.45359237,
  kilograms: 5.443108,
});
assert.deepEqual(createWeightMeasurementSnapshot(12.1234567, lb), {
  value: 12.123457,
  unitId: "lb-unit",
  factorToKg: 0.45359237,
  kilograms: 5.499108,
});
assert.equal(formatWeightMeasurement({ ...snapshot, unitSymbol: "LB", format: String }), "12 LB");
assert.equal(formatWeightMeasurement({ value: null, unitSymbol: null, kilograms: 5.443108, format: String }), "5.443108 KG");
assert.throws(() => createWeightMeasurementSnapshot(2, { ...lb, kilograms: 0 }), /factor válido/);
assert.throws(() => createWeightMeasurementSnapshot(-1, lb), /igual o mayor/);
const weightDimension = "dimension-weight";
assert.equal(normalizeReferenceCost(95,
  { dimensionId: weightDimension, conversionFactorToBase: 11.25 },
  { dimensionId: weightDimension, conversionFactorToBase: 1 }), 8.44444444);
assert.equal(normalizeReferenceCost(95,
  { dimensionId: "legacy-dump", conversionFactorToBase: 1 },
  { dimensionId: weightDimension, conversionFactorToBase: 1 }), null);

const migration = await readFile(new URL("../supabase/migrations/20261107100000_qb_measurement_snapshot_and_unit_guards.sql", import.meta.url), "utf8");
assert.match(migration, /actual_weight_value/);
assert.match(migration, /actual_weight_factor_to_kg/);
assert.match(migration, /save_qb_matrix_preparation_origin_with_weight_snapshot/);
assert.match(migration, /save_qb_matrix_delivery_origin_with_weight_snapshot/);
assert.match(migration, /snapshot_qb_receipt_line_actual_weight/);
assert.match(migration, /v_presentation\.base_unit_id is distinct from new\.base_unit_id/);
assert.match(migration, /new\.base_quantity-round\(new\.requested_quantity\*v_presentation\.conversion_factor_to_base,6\)/);
assert.match(migration, /Existing receipt rows are intentionally not backfilled/i);

const actions = await readFile(new URL("../src/lib/operational-matrix/actions.ts", import.meta.url), "utf8");
assert.match(actions, /p_actual_weight_value: parsed\.data\.actualWeightValue/);
assert.match(actions, /p_actual_weight_unit_id: parsed\.data\.actualWeightUnitId/);
assert.match(actions, /save_qb_matrix_preparation_origin_with_weight_snapshot/);
assert.match(actions, /save_qb_matrix_delivery_origin_with_weight_snapshot/);
const receiptData = await readFile(new URL("../src/lib/qb-receipts/data.ts", import.meta.url), "utf8");
assert.match(receiptData, /resolveWeightUnitFactor/);
assert.doesNotMatch(receiptData, /unitCode === "legacy_6"/);
console.log("weight measurement snapshot contract: PASS");
