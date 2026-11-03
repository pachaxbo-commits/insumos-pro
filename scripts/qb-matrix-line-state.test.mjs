import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyAutomaticDeliveryValues,
  comparePreparationCoverage,
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
    preparationDisplayUnitId: "unit-kg",
    preparationActualWeightKg: 18,
    deliveredAt: null,
    deliveryVersion: 0,
    deliveredQuantity: 0,
    deliveredBaseQuantity: 0,
    deliveryDisplayUnitId: null,
    deliveryActualWeightKg: null,
    deliveryCheck: false,
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
