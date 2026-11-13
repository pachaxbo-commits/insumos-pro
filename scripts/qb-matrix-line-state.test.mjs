import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyAutomaticDeliveryValues,
  comparePreparationCoverage,
  preparationCheckTransition,
  preparedQuantityAfterCheck,
  updateDeliveryChecks,
} from "../src/lib/operational-matrix/line-state.ts";

const requested = 20;

function deliveryLine(overrides = {}) {
  return {
    orderItemId: "item-1",
    requestedQuantity: requested,
    preparedAt: "2026-10-29T10:00:00Z",
    preparationCheck: true,
    preparedQuantity: 18,
    preparedBaseQuantity: 18,
    requestedBaseQuantity: requested,
    originPlanConfirmed: false,
    plannedPendingBaseQuantity: 0,
    plannedExternalBaseQuantity: 0,
    preparationDisplayUnitId: "unit-kg",
    preparationActualWeightKg: 18,
    deliveredAt: null,
    deliveryVersion: 0,
    deliveredQuantity: 0,
    deliveredBaseQuantity: 0,
    deliveryDisplayUnitId: null,
    deliveryActualWeightKg: null,
    deliveryCheck: false,
    deliveryWarehouseBaseQuantity: 0,
    deliveryPendingBaseQuantity: 0,
    deliveryExternalBaseQuantity: 0,
    deliveryReviewBaseQuantity: 0,
    deliverySourceConfirmed: false,
    ...overrides,
  };
}

test("preparation check completes only an empty amount and preserves a partial amount", () => {
  assert.equal(
    preparedQuantityAfterCheck({ requestedQuantity: 20, preparedQuantity: 0, preparationCheck: false }, true),
    20,
  );
  assert.equal(
    preparedQuantityAfterCheck({ requestedQuantity: 20, preparedQuantity: 18, preparationCheck: false }, true),
    18,
  );
  assert.equal(
    preparedQuantityAfterCheck({ requestedQuantity: 20, preparedQuantity: 0, preparationCheck: false }, true, true),
    0,
  );
  assert.equal(
    preparedQuantityAfterCheck({ requestedQuantity: 20, preparedQuantity: 0, preparationCheck: false }, false),
    0,
  );
  assert.equal(
    preparedQuantityAfterCheck({ requestedQuantity: 20, preparedQuantity: 0, preparationCheck: true }, true),
    0,
  );
});

test("unchecking restores only a quantity auto-filled by the checkbox", () => {
  const unchecked = { requestedQuantity: 20, preparedQuantity: 0, preparationCheck: false, preparationAutoFillPreviousQuantity: null };
  const checked = preparationCheckTransition(unchecked, true);
  assert.deepEqual(checked, { preparedQuantity: 20, previousQuantity: 0, autoFill: true, resetAutoFill: false });
  const reset = preparationCheckTransition({
    ...unchecked,
    preparedQuantity: checked.preparedQuantity,
    preparationCheck: true,
    preparationAutoFillPreviousQuantity: checked.previousQuantity,
  }, false);
  assert.deepEqual(reset, { preparedQuantity: 0, previousQuantity: null, autoFill: false, resetAutoFill: true });

  const manual = preparationCheckTransition({
    requestedQuantity: 20, preparedQuantity: 8, preparationCheck: false,
    preparationAutoFillPreviousQuantity: null,
  }, true);
  assert.deepEqual(manual, { preparedQuantity: 8, previousQuantity: null, autoFill: false, resetAutoFill: false });
  assert.deepEqual(preparationCheckTransition({
    requestedQuantity: 20, preparedQuantity: 8, preparationCheck: true,
    preparationAutoFillPreviousQuantity: null,
  }, false), { preparedQuantity: 8, previousQuantity: null, autoFill: false, resetAutoFill: false });

  const auto = { requestedQuantity: 20, preparedQuantity: 20, preparationCheck: true, preparationAutoFillPreviousQuantity: 0 };
  const manualEdit = { ...auto, preparedQuantity: 7, preparationCheck: false, preparationAutoFillPreviousQuantity: null };
  assert.equal(preparationCheckTransition(manualEdit, false).preparedQuantity, 7);
});

test("the persisted reset marker is read by the matrix and sent through the guarded RPC", async () => {
  const data = readFileSync("src/lib/operational-matrix/data.ts", "utf8");
  const actions = readFileSync("src/lib/operational-matrix/actions.ts", "utf8");
  const matrix = readFileSync("src/components/operational-matrix/operational-matrix.tsx", "utf8");
  const migration = readFileSync("supabase/migrations/20261108100000_qb_preparation_check_autofill_reset.sql", "utf8");
  assert.match(data, /auto_completed_before_quantity/);
  assert.match(actions, /save_qb_matrix_preparation_with_check_reset/);
  assert.match(actions, /p_auto_fill_quantity: parsed\.data\.autoFillQuantity/);
  assert.match(actions, /p_reset_auto_fill_quantity: parsed\.data\.resetAutoFillQuantity/);
  assert.match(matrix, /resetAutoFillQuantity: line\.preparationAutoFillResetRequested/);
  assert.match(migration, /for update/);
  assert.match(migration, /row_version/);
  assert.match(migration, /revoke all on function public\.save_qb_matrix_preparation_with_check_reset/);
});

test("delivery receives an editable suggestion from preparation without verification", () => {
  const line = deliveryLine();
  const [suggested] = applyAutomaticDeliveryValues([line]);

  assert.equal(suggested.deliveredQuantity, 18);
  assert.equal(suggested.deliveredBaseQuantity, 18);
  assert.equal(suggested.deliveryDisplayUnitId, "unit-kg");
  assert.equal(suggested.deliveryActualWeightKg, 18);
  assert.equal(suggested.deliveryCheck, false);
  assert.equal(line.deliveredQuantity, 0);
});

test("zero external preparation, edited quantity, and confirmed delivery are never overwritten", () => {
  const zero = deliveryLine({ preparedQuantity: 0, preparedBaseQuantity: 0 });
  const edited = deliveryLine({ deliveredQuantity: 17 });
  const confirmed = deliveryLine({ deliveryVersion: 1, deliveredQuantity: 17 });
  const result = applyAutomaticDeliveryValues([zero, edited, confirmed]);

  assert.equal(result[0], zero);
  assert.equal(result[0].deliveredQuantity, 0);
  assert.equal(result[1].deliveredQuantity, 17);
  assert.equal(result[2].deliveredQuantity, 17);
});

test("a confirmed preparation origin plan becomes an editable delivery suggestion without checking delivery", () => {
  const planned = deliveryLine({
    preparedQuantity: 20,
    preparedBaseQuantity: 20,
    requestedQuantity: 25,
    requestedBaseQuantity: 25,
    originPlanConfirmed: true,
    plannedPendingBaseQuantity: 3,
    plannedExternalBaseQuantity: 2,
  });
  const [suggested] = applyAutomaticDeliveryValues([planned]);
  assert.equal(suggested.deliveredQuantity, 25);
  assert.equal(suggested.deliveredBaseQuantity, 25);
  assert.equal(suggested.deliveryWarehouseBaseQuantity, 20);
  assert.equal(suggested.deliveryPendingBaseQuantity, 3);
  assert.equal(suggested.deliveryExternalBaseQuantity, 2);
  assert.equal(suggested.deliveryReviewBaseQuantity, 0);
  assert.equal(suggested.deliverySourceConfirmed, true);
  assert.equal(suggested.deliveryCheck, false);
});

test("a zero-warehouse external preparation can suggest the planned delivery without auto-checking it", () => {
  const planned = deliveryLine({
    preparedQuantity: 0,
    preparedBaseQuantity: 0,
    requestedQuantity: 10,
    requestedBaseQuantity: 10,
    originPlanConfirmed: true,
    plannedExternalBaseQuantity: 10,
  });
  const [suggested] = applyAutomaticDeliveryValues([planned]);
  assert.equal(suggested.deliveredQuantity, 10);
  assert.equal(suggested.deliveryExternalBaseQuantity, 10);
  assert.equal(suggested.deliveryWarehouseBaseQuantity, 0);
  assert.equal(suggested.deliverySourceConfirmed, true);
  assert.equal(suggested.deliveryCheck, false);
});

test("delivery checks can be checked and unchecked for only the selected grouped items", () => {
  const lines = [
    { orderItemId: "one", deliveryCheck: false },
    { orderItemId: "two", deliveryCheck: true },
    { orderItemId: "three", deliveryCheck: false },
  ];
  const selected = new Set(["one", "two"]);

  const checked = updateDeliveryChecks(lines, selected, true);
  assert.deepEqual(checked.map((line) => line.deliveryCheck), [true, true, false]);

  const unchecked = updateDeliveryChecks(checked, selected, false);
  assert.deepEqual(unchecked.map((line) => line.deliveryCheck), [false, false, false]);
});

test("preparation coverage compares physical base units and reports short, exact, excess, and unknown", () => {
  // 2 CUARTILLAS at the persisted 11.25 KG factor are compared with the
  // measured preparation in KG, never by comparing their displayed numbers.
  assert.deepEqual(comparePreparationCoverage({
    requestedBaseQuantity: 22.5,
    preparedBaseQuantity: 22.5,
    requestedConversionValid: true,
  }), { status: "complete" });
  assert.deepEqual(comparePreparationCoverage({
    requestedBaseQuantity: 20,
    preparedBaseQuantity: 8,
    requestedConversionValid: true,
  }), { status: "short", missingBaseQuantity: 12 });
  assert.deepEqual(comparePreparationCoverage({
    requestedBaseQuantity: 20,
    preparedBaseQuantity: 0,
    requestedConversionValid: true,
  }), { status: "short", missingBaseQuantity: 20 });
  assert.deepEqual(comparePreparationCoverage({
    requestedBaseQuantity: 20,
    preparedBaseQuantity: 22,
    requestedConversionValid: true,
  }), { status: "over", excessBaseQuantity: 2 });
  assert.deepEqual(comparePreparationCoverage({
    requestedBaseQuantity: 20,
    preparedBaseQuantity: 20,
    requestedConversionValid: true,
    verified: false,
  }), { status: "unverified" });
  assert.deepEqual(comparePreparationCoverage({
    requestedBaseQuantity: 20,
    preparedBaseQuantity: 8,
    requestedConversionValid: false,
  }), { status: "unverified" });
});

test("delivery verification stays independent from preparation and round-trips its saved boolean", () => {
  const data = readFileSync("src/lib/operational-matrix/data.ts", "utf8");
  const actions = readFileSync("src/lib/operational-matrix/actions.ts", "utf8");
  const initial = deliveryLine({ preparationCheck: true, deliveryCheck: false });
  assert.equal(initial.deliveryCheck, false);
  assert.equal(updateDeliveryChecks([initial], new Set(["item-1"]), true)[0].deliveryCheck, true);
  assert.equal(updateDeliveryChecks([initial], new Set(["item-1"]), false)[0].deliveryCheck, false);
  assert.match(data, /const deliveryCheck = Boolean\(delivery\?\.delivery_check\)/);
  assert.match(actions, /p_delivery_check:\s*parsed\.data\.deliveryCheck/);
});
