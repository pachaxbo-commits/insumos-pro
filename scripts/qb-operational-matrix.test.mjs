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
] =
  await Promise.all([
    read("supabase/migrations/20260723130000_qb_operational_matrix_foundation.sql"),
    read("supabase/migrations/20260723130100_qb_operational_matrix_workflows.sql"),
    read("supabase/migrations/20260723130200_qb_receipt_additive_factors.sql"),
    read("supabase/migrations/20260723210100_qb_operational_guest_orders.sql"),
    read("supabase/migrations/20260723210200_qb_matrix_confirmation_idempotency.sql"),
    read("supabase/migrations/20260723210000_qb_entregador_admin_role.sql"),
    read("src/components/admin/user-management.tsx"),
    read("src/components/operational-matrix/operational-matrix.tsx"),
    read("src/lib/operational-matrix/actions.ts"),
    read("src/components/qb-receipts/receipt-document.tsx"),
    read("docs/QB_MATRIZ_OPERATIVA.md"),
  ]);

const newSources = [foundation, workflows, factors, matrix, actions, docs].join("\n");
assert.doesNotMatch(newSources, /epxmrfwtssbcqsytuwhf|wfhvuzigmkgojdoofjib/);
assert.doesNotMatch(newSources, /SUPABASE_SCHEMA\.sql/i);
assert.match(foundation, /'entregador'/);
assert.match(foundation, /qb_order_delivery_items/);
assert.match(foundation, /qb_order_line_change_events/);
assert.match(foundation, /qb_operational_day_orders/);
assert.match(guestOrders, /qb_operational_day_orders[\s\S]*customer_account_id drop not null/);
assert.match(guestOrders, /qb_order_line_change_events[\s\S]*customer_account_id drop not null/);
assert.match(
  confirmationIdempotency,
  /v_confirmation\.status = 'confirmado'[\s\S]*v_confirmation\.idempotency_key = p_idempotency_key/,
);
assert.match(entregadorAdmin, /'administrador', 'ventas', 'inventario', 'entregador', 'finanzas'/);
assert.match(userManagement, /Entregador registra únicamente la entrega en[\s\S]*Matriz operativa/);
assert.match(workflows, /row_version <> p_expected_version/);
assert.match(workflows, /using errcode = '40001'/);
assert.match(workflows, /last_idempotency_key = p_idempotency_key/);
assert.match(workflows, /prepared_base_quantity_snapshot/);
assert.match(workflows, /externally_sourced_base_quantity/);
assert.match(workflows, /v_line\.prepared_base_quantity_snapshot/);
assert.doesNotMatch(
  workflows.match(/insert into public\.inventory_movements[\s\S]*?returning id into v_movement_id;/)?.[0] ?? "",
  /externally_sourced/,
);
assert.match(workflows, /v_role not in \('admin', 'administrador', 'entregador'\)/);
assert.match(workflows, /v_role not in \('admin', 'administrador', 'inventario'\)/);
assert.match(actions, /save_qb_matrix_preparation_item/);
assert.match(actions, /save_qb_matrix_delivery_item/);
assert.match(matrix, /Renderizado virtual/);
assert.match(matrix, /dirty\.current\.size/);
assert.match(matrix, /postgres_changes/);
assert.match(matrix, /selectedMobileOrder/);
assert.match(factors, /factor_mode', 'additive_percent'/);
assert.match(factors, /v_factor_total/);
assert.doesNotMatch(
  factors.match(/create or replace function public\.qb_compound_unit_price[\s\S]*?\$\$;/)?.[0] ?? "",
  /\* \(1 \+ coalesce\(p_exigency/,
);
assert.match(factors, /old\.status <> 'borrador'/);
assert.match(receiptDocument, /isCustomerExport \? "Comprobante de entrega" : receipt\.number/);
assert.match(receiptDocument, /!isCustomerExport \? <div className="border-b py-5">/);

const scenarios = [
  { requested: 5, prepared: 5, external: 0, delivered: 5, stock: 5, receipt: 5 },
  { requested: 5, prepared: 3, external: 2, delivered: 5, stock: 3, receipt: 5 },
  { requested: 3, prepared: 3, external: 1, delivered: 4, stock: 3, receipt: 4 },
  { requested: 3, prepared: 3, external: 0, delivered: 2, stock: 3, receipt: 2 },
];
for (const scenario of scenarios) {
  assert.equal(scenario.stock, scenario.prepared, "stock uses warehouse component only");
  assert.equal(scenario.receipt, scenario.delivered, "receipt uses actual delivery only");
  assert.ok(
    scenario.delivered <= scenario.prepared + scenario.external,
    "delivery is backed by warehouse plus external sourcing",
  );
}
assert.ok(Math.abs(100 * (1 + (5 + 5 + 5) / 100) - 115) < 0.000001);

console.log("QB operational matrix contracts: OK");
