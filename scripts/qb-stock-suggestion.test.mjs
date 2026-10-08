import assert from "node:assert/strict";
import { suggestWarehouseSplit } from "../src/lib/operational-matrix/stock-suggestion.ts";

assert.deepEqual(suggestWarehouseSplit({ requestedQuantity: 10, requestedBaseQuantity: 10, stockCurrent: 4 }), {
  availableBase: 4, warehouseQuantity: 4, externalQuantity: 6,
});
assert.deepEqual(suggestWarehouseSplit({ requestedQuantity: 2, requestedBaseQuantity: 20, stockCurrent: 4 }), {
  availableBase: 4, warehouseQuantity: 0.4, externalQuantity: 1.6,
});
assert.deepEqual(suggestWarehouseSplit({ requestedQuantity: 3, requestedBaseQuantity: 3, stockCurrent: 0 }), {
  availableBase: 0, warehouseQuantity: 0, externalQuantity: 3,
});
assert.equal(suggestWarehouseSplit({ requestedQuantity: 10, requestedBaseQuantity: 10, stockCurrent: 10 }), null);
assert.equal(suggestWarehouseSplit({ requestedQuantity: 10, requestedBaseQuantity: 0, stockCurrent: 4 }), null);
console.log("Stock suggestion: OK");
