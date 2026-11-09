import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, action, creator, workspace] = await Promise.all([
  readFile("supabase/migrations/20261109100000_qb_controlled_post_preparation_order_edits.sql", "utf8"),
  readFile("src/lib/qb-orders/actions.ts", "utf8"),
  readFile("src/components/qb-orders/internal-order-creator.tsx", "utf8"),
  readFile("src/components/qb-orders/order-creation-workspace.tsx", "utf8"),
]);

assert.match(migration, /security definer set search_path = pg_catalog/);
assert.match(migration, /v_role not in \('admin','administrador'\)/);
assert.match(migration, /for update/);
assert.match(migration, /request_payload <> v_request/);
assert.match(migration, /response_payload is not null[\s\S]*?replayed',true/);
assert.match(migration, /QB_ORDER_LINE_ALREADY_DELIVERED/);
assert.match(migration, /qb_receipt_lines/);
assert.match(migration, /expected_version/);
assert.match(migration, /admin_add_qb_order_line/);
assert.match(migration, /admin_remove_qb_order_line/);
assert.match(migration, /admin_update_qb_order_line_after_preparation/);
assert.match(migration, /'delivery_item',case when v_delivery\.id is null then null else to_jsonb\(v_delivery\) end/);
assert.match(migration, /delivery_check=false/);
assert.match(migration, /qb_same_day_reconciliation_requests/);
assert.match(migration, /join public\.qb_product_unit_settings settings/);
assert.match(migration, /select product\.\*,settings\.base_unit_id/);
assert.match(action, /admin_update_qb_internal_order_after_preparation/);
assert.match(action, /auth\.user\.role !== "administrador"/);
assert.match(creator, /name="operational_date" value=\{operationalDate\}/);
assert.match(creator, /las líneas afectadas deberán revisarse nuevamente/);
assert.match(workspace, /onClick=\{\(\) => startEditing\(order\.id\)\}/);

console.log("PASS: edición posterior a Preparación protegida, versionada, auditada y con fecha fija serializada");
