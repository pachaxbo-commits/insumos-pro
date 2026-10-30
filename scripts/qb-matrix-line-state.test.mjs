import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAutomaticDeliveryValues,
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
