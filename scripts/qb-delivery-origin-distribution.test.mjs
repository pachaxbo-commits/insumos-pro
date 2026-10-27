import assert from "node:assert/strict";
import {
  baseQuantityToSource,
  originDistributionIsResolved,
  originDistributionMatches,
  originDistributionTotal,
  resolveDeliveryOrigin,
  sourceQuantityToBase,
} from "../src/lib/operational-matrix/origin-distribution.ts";

const distribution = (warehouse, pendingToday, externalDefinitive, review = 0) => ({
  warehouse,
  pendingToday,
  externalDefinitive,
  review,
});

for (const [name, value] of [
  ["100% almacén", distribution(20, 0, 0)],
  ["100% externo", distribution(0, 0, 20)],
  ["100% pendiente hoy", distribution(0, 20, 0)],
  ["mixto", distribution(8, 7, 5)],
]) {
  assert.equal(originDistributionIsResolved(value, 20), true, name);
}

assert.equal(originDistributionMatches(distribution(8, 7, 4), 20), false, "rechaza suma incompleta");
assert.equal(originDistributionIsResolved(distribution(8, 7, 4, 1), 20), false, "bloquea origen por revisar");
assert.equal(sourceQuantityToBase(3, 2.5), 7.5, "usa solo equivalencia física ya aprobada");
assert.equal(baseQuantityToSource(7.5, 2.5), 3);
assert.equal(sourceQuantityToBase(3, 0), 0, "rechaza una conversión inexistente");

const mixed = distribution(8, 7, 5);
const legacyDeliveryOrigin = resolveDeliveryOrigin({
  persisted: false,
  persistedOrigin: distribution(0, 0, 0),
  legacyDeliveredBaseQuantity: 6,
  preparationOrigin: distribution(2, 1, 2, 1),
});
assert.deepEqual(legacyDeliveryOrigin, distribution(0, 0, 0, 6));
assert.equal(originDistributionTotal(legacyDeliveryOrigin), 6, "histórico sin origen queda una sola vez en revisión");
assert.deepEqual(resolveDeliveryOrigin({
  persisted: false,
  persistedOrigin: distribution(0, 0, 0),
  legacyDeliveredBaseQuantity: 0,
  preparationOrigin: mixed,
}), mixed, "la entrega nueva hereda el plan explícito de preparación");
assert.deepEqual(resolveDeliveryOrigin({
  persisted: true,
  persistedOrigin: mixed,
  legacyDeliveredBaseQuantity: 6,
  preparationOrigin: distribution(20, 0, 0),
}), mixed, "respeta la distribución real persistida");

console.log("Delivery source distribution scenarios: PASS");
