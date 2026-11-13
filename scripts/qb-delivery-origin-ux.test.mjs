import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allocationForDeliveryOrigin } from "../src/lib/operational-matrix/delivery-origin-choice.ts";

const matrix = readFileSync("src/components/operational-matrix/operational-matrix.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261027110000_qb_defer_delivery_origin_until_delivery.sql", "utf8");
const preparationReviewMigration = readFileSync("supabase/migrations/20261027120000_qb_review_zero_preparation_quantity.sql", "utf8");
const workflow = readFileSync("supabase/tests/qb_operational_matrix_workflow_rollback.sql", "utf8");
const matrixData = readFileSync("src/lib/operational-matrix/data.ts", "utf8");
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

assert.match(selector, /Ajustar origen por producto/);
assert.match(selector, /Guardar origen de \{line\.productName\}/);
assert.match(selector, /!line\.deliverySourceConfirmed && !readOnly/);
assert.doesNotMatch(selector, /<select|Todos los productos/);
assert.match(matrix, /deliverySourceConfirmed = false/);
assert.match(matrix, /DeliveryOriginControl[\s\S]*selectedConfirmationOrder/);
assert.doesNotMatch(matrix, /actionForCustomer\(group, "confirm"\)/);
assert.match(matrix, /<OperationalDateFilter[\s\S]*currentDate=\{operationalDate\}/);
assert.match(matrix, /<PendingWorkBar[\s\S]*isAllPending=\{false\}/);
assert.match(matrix, /role="tablist"[\s\S]*aria-label="Etapa operativa"/);
assert.match(matrix, /role="group" aria-label="Vista operativa"/);
assert.doesNotMatch(matrix, /function stageGuidance\(|Confirmación de Inventario|Confirmación del Entregador/);
assert.doesNotMatch(matrix, /max-h-\[calc\(100vh-12rem\)\]/);
assert.match(matrix, /overflow-x-auto overflow-y-clip overscroll-x-contain/);
assert.match(matrix, /data-matrix-layout="continuous-sheet"/);
assert.match(matrix, /grid min-w-40 grid-cols-2 items-start gap-2/);
assert.match(matrix, /rows=\{1\}/);

assert.match(migration, /pi\.prepared_at_line is null/);
assert.doesNotMatch(migration, /origin_plan_confirmed\s+or|actual_base_quantity\s*\+/i);
assert.match(migration, /from public,anon/);
assert.match(migration, /to authenticated/);
assert.match(workflow, /QB_MATRIX_PREPARATION_WITHOUT_ORIGIN_FAILED/);
assert.match(preparationReviewMigration, /preparation_check records that the line was reviewed/i);
assert.doesNotMatch(preparationReviewMigration, /El check completo exige preparar exactamente lo solicitado/);
assert.match(matrixData, /const preparedQuantity = rawPreparedQuantity;/);
assert.doesNotMatch(matrixData, /preparationCheck && rawPreparedQuantity <= 0\.000001\s*\?\s*requestedQuantity/);
assert.match(workflow, /QB_MATRIX_ZERO_WAREHOUSE_PREPARATION_WAS_INFLATED_OR_DEBITED/);
assert.match(workflow, /QB_MATRIX_ZERO_WAREHOUSE_EXTERNAL_DELIVERY_CHANGED_STOCK/);

console.log("Delivery origin UX and preparation contract: PASS");
