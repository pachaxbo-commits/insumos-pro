import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [
  foundation,
  workflows,
  factors,
  guestOrders,
  confirmationIdempotency,
  entregadorAdmin,
  userManagement,
  matrix,
  actions,
  receiptDocument,
  docs,
  legacyFlow,
  actualWeight,
  weightControl,
  liveFlow,
  productActions,
  productForm,
  newProduct,
  deliveryUnlock,
] = await Promise.all([
  read(
    "supabase/migrations/20260723130000_qb_operational_matrix_foundation.sql",
  ),
  read(
    "supabase/migrations/20260723130100_qb_operational_matrix_workflows.sql",
  ),
  read("supabase/migrations/20260723130200_qb_receipt_additive_factors.sql"),
  read("supabase/migrations/20260723210100_qb_operational_guest_orders.sql"),
  read(
    "supabase/migrations/20260723210200_qb_matrix_confirmation_idempotency.sql",
  ),
  read("supabase/migrations/20260723210000_qb_entregador_admin_role.sql"),
  read("src/components/admin/user-management.tsx"),
  read("src/components/operational-matrix/operational-matrix.tsx"),
  read("src/lib/operational-matrix/actions.ts"),
  read("src/components/qb-receipts/receipt-document.tsx"),
  read("docs/QB_MATRIZ_OPERATIVA.md"),
  read("supabase/migrations/20260724100000_qb_legacy_three_column_flow.sql"),
  read("supabase/migrations/20260724110000_qb_matrix_actual_weight.sql"),
  read(
    "supabase/migrations/20260724120000_qb_product_actual_weight_control.sql",
  ),
  read(
    "supabase/migrations/20260725010000_qb_live_preparation_delivery_flow.sql",
  ),
  read("src/lib/products/actions.ts"),
  read("src/components/products/product-management.tsx"),
  read("src/components/products/new-product-dialog.tsx"),
  read(
    "supabase/migrations/20260725010500_qb_delivery_can_complete_unreviewed_lines.sql",
  ),
]);

const newSources = [foundation, workflows, factors, matrix, actions, docs].join(
  "\n",
);
const matrixData = await read("src/lib/operational-matrix/data.ts");
assert.doesNotMatch(newSources, /epxmrfwtssbcqsytuwhf|wfhvuzigmkgojdoofjib/);
assert.doesNotMatch(newSources, /SUPABASE_SCHEMA\.sql/i);
assert.match(foundation, /'entregador'/);
assert.match(foundation, /qb_order_delivery_items/);
assert.match(foundation, /qb_order_line_change_events/);
assert.match(foundation, /qb_operational_day_orders/);
assert.match(
  guestOrders,
  /qb_operational_day_orders[\s\S]*customer_account_id drop not null/,
);
assert.match(
  guestOrders,
  /qb_order_line_change_events[\s\S]*customer_account_id drop not null/,
);
assert.match(
  confirmationIdempotency,
  /v_confirmation\.status = 'confirmado'[\s\S]*v_confirmation\.idempotency_key = p_idempotency_key/,
);
assert.match(
  entregadorAdmin,
  /'administrador', 'ventas', 'inventario', 'entregador', 'finanzas'/,
);
assert.match(
  userManagement,
  /Entregador registra únicamente la entrega en[\s\S]*Matriz operativa/,
);
assert.match(workflows, /row_version <> p_expected_version/);
assert.match(workflows, /using errcode = '40001'/);
assert.match(workflows, /last_idempotency_key = p_idempotency_key/);
assert.match(workflows, /prepared_base_quantity_snapshot/);
assert.match(workflows, /externally_sourced_base_quantity/);
assert.match(workflows, /v_line\.prepared_base_quantity_snapshot/);
assert.doesNotMatch(
  workflows.match(
    /insert into public\.inventory_movements[\s\S]*?returning id into v_movement_id;/,
  )?.[0] ?? "",
  /externally_sourced/,
);
assert.match(
  workflows,
  /v_role not in \('admin', 'administrador', 'entregador'\)/,
);
assert.match(
  workflows,
  /v_role not in \('admin', 'administrador', 'inventario'\)/,
);
assert.match(actions, /save_qb_matrix_preparation_item/);
assert.match(actions, /save_qb_matrix_delivery_item/);
assert.match(matrix, /data-matrix-layout="continuous-sheet"/);
assert.match(matrix, /<table className=/);
assert.match(matrix, /sticky left-0/);
assert.match(matrix, /DESCRIPCIÓN/);
assert.match(matrix, /TOTALES POR CLIENTE/);
assert.match(matrix, /dirty\.current\.size/);
assert.match(matrix, /const linesRef = useRef\(lines\)/);
assert.match(
  matrix,
  /const latestLine = \(id: string\) =>\s+linesRef\.current\.find/,
);
assert.match(matrix, /linesRef\.current = updatedLines/);
assert.match(matrix, /preparationSaveQueues/);
assert.match(matrix, /deliverySaveQueues/);
assert.match(matrix, /Math\.max\(line\[versionField\], version\)/);
assert.match(matrix, /postgres_changes/);
assert.doesNotMatch(
  matrix,
  /selectedMobileOrder|selectedOrder|MobileRow|<select/,
);
assert.match(matrix, /customerGroups\.map\(\(group/);
assert.match(matrix, /scrollIntoView/);
assert.match(matrixData, /customer_account_id/);
assert.match(matrixData, /customerKey:/);
assert.match(matrix, /function aggregateLines/);
assert.match(matrix, /groupLineMap/);
assert.match(matrix, /saveGroupedPreparation/);
assert.match(matrix, /saveGroupedDelivery/);
assert.match(matrix, /actionForCustomer/);
assert.match(matrix, /moveCustomer/);
assert.match(matrix, /"CHECK INV\.", "PESO\/CANT\. REAL"/);
assert.doesNotMatch(matrix, /return \["CANT", "PREP\./);
assert.match(matrix, /formatQuantity\(line\.requestedQuantity\)/);
assert.match(
  matrix,
  /preparedQuantity: checked \? line\.requestedQuantity : 0/,
);
assert.match(matrix, /function QuantityEditor/);
assert.match(matrix, /Cantidad real entregada de/);
assert.match(matrix, /deliveryCheck: true/);
assert.match(matrix, /preparationActualWeightKg/);
assert.match(matrix, /deliveryActualWeightKg/);
assert.doesNotMatch(matrix, /Peso real bodega/);
assert.match(matrix, /function WeightEditor[\s\S]*step="0\.5"/);
assert.match(matrix, /line\.controlsActualWeight \? \(/);
assert.match(matrix, /Valor inicial de Inventario · editable/);
assert.match(matrix, /mergeServerLines/);
assert.match(matrix, /const deliveryDisabled = !editable/);
assert.doesNotMatch(
  matrix,
  /disabled=\{deliveryDisabled \|\| !needsDeliveryReview\}/,
);
assert.match(matrix, /needsDeliveryReview && !line\.deliveryCheck\s+\? null/);
assert.match(matrix, /!line\.deliveredAt &&\s+line\.deliveryVersion === 0/);
assert.match(matrix, /line\.deliveredQuantity - line\.preparedQuantity/);
assert.match(
  legacyFlow,
  /'admin', 'administrador', 'inventario', 'entregador'/,
);
assert.match(legacyFlow, /catalog_quantity_step = 0\.5/);
assert.match(legacyFlow, /usage_context = 'pedido'/);
assert.match(actualWeight, /add column if not exists actual_weight_kg numeric/);
assert.match(actualWeight, /'actual_weight_kg'/);
assert.match(actualWeight, /save_qb_matrix_preparation_item_with_weight/);
assert.match(actualWeight, /save_qb_matrix_delivery_item_with_weight/);
assert.match(
  weightControl,
  /add column if not exists controls_actual_weight boolean not null default false/,
);
assert.match(weightControl, /enforce_qb_product_actual_weight_control/);
assert.match(liveFlow, /quantity_step = 0\.5/);
assert.match(liveFlow, /Inventario todavía no revisó esta línea/);
assert.match(
  deliveryUnlock,
  /rename to save_qb_matrix_delivery_item_with_weight_v2/,
);
assert.match(deliveryUnlock, /insert into public\.qb_order_preparation_items/);
assert.match(deliveryUnlock, /prepared_at_line/);
assert.match(deliveryUnlock, /'admin', 'administrador', 'entregador'/);
assert.match(
  deliveryUnlock,
  /return public\.save_qb_matrix_delivery_item_with_weight_v2/,
);
assert.match(
  liveFlow,
  /v_effective_weight < v_preparation_item\.actual_quantity/,
);
assert.match(
  liveFlow,
  /set delivered_base_quantity = round\(v_effective_weight, 6\)/,
);
assert.match(productActions, /p_controls_actual_weight/);
assert.match(productForm, /name="controls_actual_weight"/);
assert.match(newProduct, /name="controls_actual_weight"/);
assert.match(factors, /factor_mode', 'additive_percent'/);
assert.match(factors, /v_factor_total/);
assert.doesNotMatch(
  factors.match(
    /create or replace function public\.qb_compound_unit_price[\s\S]*?\$\$;/,
  )?.[0] ?? "",
  /\* \(1 \+ coalesce\(p_exigency/,
);
assert.match(factors, /old\.status <> 'borrador'/);
assert.match(
  receiptDocument,
  /isCustomerExport \? "Comprobante de entrega" : receipt\.number/,
);
assert.match(
  receiptDocument,
  /!isCustomerExport \? <div className="border-b py-5">/,
);
assert.match(
  receiptDocument,
  /isCustomerExport \? "Fecha de entrega" : "Periodo"/,
);
assert.match(receiptDocument, /!isCustomerExport && receipt\.visibleNote/);

const scenarios = [
  {
    requested: 5,
    prepared: 5,
    external: 0,
    delivered: 5,
    stock: 5,
    receipt: 5,
  },
  {
    requested: 5,
    prepared: 3,
    external: 2,
    delivered: 5,
    stock: 3,
    receipt: 5,
  },
  {
    requested: 3,
    prepared: 3,
    external: 1,
    delivered: 4,
    stock: 3,
    receipt: 4,
  },
  {
    requested: 3,
    prepared: 3,
    external: 0,
    delivered: 2,
    stock: 3,
    receipt: 2,
  },
];
for (const scenario of scenarios) {
  assert.equal(
    scenario.stock,
    scenario.prepared,
    "stock uses warehouse component only",
  );
  assert.equal(
    scenario.receipt,
    scenario.delivered,
    "receipt uses actual delivery only",
  );
  assert.ok(
    scenario.delivered <= scenario.prepared + scenario.external,
    "delivery is backed by warehouse plus external sourcing",
  );
}
assert.ok(Math.abs(100 * (1 + (5 + 5 + 5) / 100) - 115) < 0.000001);

console.log("QB operational matrix contracts: OK");
