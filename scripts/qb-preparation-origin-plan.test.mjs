import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  preparationPlanQuantities,
  preparationStockCapacityByLine,
} from "../src/lib/operational-matrix/preparation-origin-plan.ts";

function line(id, overrides = {}) {
  return {
    orderItemId: id,
    orderId: `order-${id}`,
    productId: "product-1",
    stockCurrent: 20,
    requestedBaseQuantity: 15,
    preparedBaseQuantity: 0,
    baseUnitId: "kg",
    inventoryBaseUnitId: "kg",
    requestedConversionValid: true,
    ...overrides,
  };
}

const active = new Set(["order-a", "order-b"]);
const shared = preparationStockCapacityByLine([
  line("a", { orderId: "order-a" }),
  line("b", { orderId: "order-b" }),
], active);
assert.equal(shared.get("a")?.allocatedBaseQuantity, 15);
assert.equal(shared.get("b")?.allocatedBaseQuantity, 5);
assert.equal(shared.get("a")?.availableBaseQuantity, 20);
assert.equal(shared.get("b")?.availableBaseQuantity, 20);

const unknownUnit = preparationStockCapacityByLine([
  line("a", { inventoryBaseUnitId: "unit" }),
], new Set(["order-a"]));
assert.equal(unknownUnit.get("a")?.known, false);
assert.match(unknownUnit.get("a")?.reason ?? "", /no coincide/);

const unknownConversion = preparationStockCapacityByLine([
  line("a", { requestedConversionValid: false }),
], new Set(["order-a"]));
assert.equal(unknownConversion.get("a")?.known, false);
assert.match(unknownConversion.get("a")?.reason ?? "", /no es verificable/);

const pendingPlan = preparationPlanQuantities({
  requestedBaseQuantity: 10,
  preparedBaseQuantity: 0,
  pendingBaseQuantity: 10,
  externalBaseQuantity: 0,
  capacity: { known: true, availableBaseQuantity: 0, allocatedBaseQuantity: 0, reason: null },
});
assert.equal(pendingPlan.missingBaseQuantity, 10);
assert.equal(pendingPlan.resolved, true);
assert.equal(pendingPlan.canConfirm, true);

const partialPlan = preparationPlanQuantities({
  requestedBaseQuantity: 25,
  preparedBaseQuantity: 20,
  pendingBaseQuantity: 2,
  externalBaseQuantity: 3,
  capacity: { known: true, availableBaseQuantity: 20, allocatedBaseQuantity: 20, reason: null },
});
assert.equal(partialPlan.missingBaseQuantity, 5);
assert.equal(partialPlan.resolved, true);
assert.equal(partialPlan.canConfirm, true);

const negativeStockPlan = preparationPlanQuantities({
  requestedBaseQuantity: 25,
  preparedBaseQuantity: 21,
  pendingBaseQuantity: 4,
  externalBaseQuantity: 0,
  capacity: { known: true, availableBaseQuantity: 20, allocatedBaseQuantity: 20, reason: null },
});
assert.equal(negativeStockPlan.exceedsAvailable, true);
assert.equal(negativeStockPlan.canConfirm, false);

console.log("PASS: stock is allocated once across shared product lines and ambiguous units block planning");

const matrix = readFileSync("src/components/operational-matrix/operational-matrix.tsx", "utf8");
const actions = readFileSync("src/lib/operational-matrix/actions.ts", "utf8");
const lineState = readFileSync("src/lib/operational-matrix/line-state.ts", "utf8");
assert.match(matrix, /function PreparationOriginPlanEditor/);
assert.match(matrix, /preparationPlanLines=\{groupedLines\}/);
assert.match(matrix, /pendingBaseQuantity: line\.plannedPendingBaseQuantity/);
assert.match(matrix, /externalBaseQuantity: line\.plannedExternalBaseQuantity/);
assert.match(actions, /p_origin_plan_confirmed: parsed\.data\.originPlanConfirmed/);
assert.match(lineState, /deliverySourceConfirmed: usePreparationPlan/);
assert.match(matrix, /const unresolvedOrigin = groupLines\.find\(\(line\) => !deliveryOriginIsReady\(line\)\)/);
assert.doesNotMatch(matrix, /if \(targetOrders\.some\(\(order\) => !deliveryOriginByOrder\[order\.id\]\)\)/);
console.log("PASS: preparation form/table save per-line plans and delivery inherits a valid plan");
