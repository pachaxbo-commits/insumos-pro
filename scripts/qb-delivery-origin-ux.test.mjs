import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allocationForDeliveryOrigin } from "../src/lib/operational-matrix/delivery-origin-choice.ts";

const matrix = readFileSync("src/components/operational-matrix/operational-matrix.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261027110000_qb_defer_delivery_origin_until_delivery.sql", "utf8");
const workflow = readFileSync("supabase/tests/qb_operational_matrix_workflow_rollback.sql", "utf8");
const selector = matrix.slice(matrix.indexOf("function DeliveryOriginControl("), matrix.indexOf("function OriginSplitEditor("));

assert.deepEqual(allocationForDeliveryOrigin("warehouse", 20), {
  deliveryWarehouseBaseQuantity: 20,
  deliveryPendingBaseQuantity: 0,
  deliveryExternalBaseQuantity: 0,
  deliveryReviewBaseQuantity: 0,
  deliverySourceConfirmed: true,
});
assert.deepEqual(allocationForDeliveryOrigin("pending", 20), {
  deliveryWarehouseBaseQuantity: 0,
  deliveryPendingBaseQuantity: 20,
  deliveryExternalBaseQuantity: 0,
  deliveryReviewBaseQuantity: 0,
  deliverySourceConfirmed: true,
});
assert.deepEqual(allocationForDeliveryOrigin("external", 20), {
  deliveryWarehouseBaseQuantity: 0,
  deliveryPendingBaseQuantity: 0,
  deliveryExternalBaseQuantity: 20,
  deliveryReviewBaseQuantity: 0,
  deliverySourceConfirmed: true,
});
assert.deepEqual(allocationForDeliveryOrigin("mixed", 20), {
  deliveryWarehouseBaseQuantity: 0,
  deliveryPendingBaseQuantity: 0,
  deliveryExternalBaseQuantity: 0,
  deliveryReviewBaseQuantity: 20,
  deliverySourceConfirmed: false,
});
assert.equal(allocationForDeliveryOrigin("external", -1).deliveryExternalBaseQuantity, 0);

assert.match(selector, /Selecciona el origen real/);
assert.match(matrix, /useState<Record<string, DeliveryOriginChoice \| null>>\(\{\}\)/);
assert.match(matrix, /deliverySourceConfirmed = false/);
assert.match(matrix, /Antes de confirmar la entrega, indica de dónde salió la mercadería/);
assert.match(matrix, /DeliveryOriginControl[\s\S]*selectedConfirmationOrder/);
assert.match(selector, /Origen mixto/);
assert.match(selector, /Confirmar distribución mixta/);
assert.match(selector, /Todos los productos entregados en este pedido salen del almacén/);
assert.match(selector, /ingresos físicos confirmados durante esa misma jornada/);
assert.match(selector, /sin descontar inventario/);
assert.doesNotMatch(selector, /<option value="review">/);
assert.doesNotMatch(matrix, /actionForCustomer\(group, "confirm"\)/);
assert.match(matrix, /El origen de la mercadería se confirma durante Entrega/);

assert.match(migration, /pi\.prepared_at_line is null/);
assert.doesNotMatch(migration, /origin_plan_confirmed\s+or|actual_base_quantity\s*\+/i);
assert.match(migration, /from public,anon/);
assert.match(migration, /to authenticated/);
assert.match(workflow, /QB_MATRIX_PREPARATION_WITHOUT_ORIGIN_FAILED/);

console.log("Delivery origin UX and preparation contract: PASS");
