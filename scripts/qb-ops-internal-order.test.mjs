import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [page, component, creator, actions, data, migration, sqlContract] = await Promise.all([
  read("src/app/(private)/pedidos/page.tsx"),
  read("src/components/qb-orders/qb-orders-management.tsx"),
  read("src/components/qb-orders/internal-order-creator.tsx"),
  read("src/lib/qb-orders/actions.ts"),
  read("src/lib/qb-orders/data.ts"),
  read("supabase/migrations/20260712092200_qb_ops_internal_order_creation.sql"),
  read("supabase/tests/qb_ops_internal_order_flow_contract.sql"),
]);

test("Nuevo pedido solo se habilita para administrador", () => {
  assert.match(page, /auth\.user\.role === "administrador"/);
  assert.match(component, /canCreateOrder && creation/);
  assert.match(actions, /auth\.user\.role !== "administrador"/);
});

test("la interfaz permite cliente registrado o invitado manual", () => {
  assert.match(creator, /Cliente registrado/);
  assert.match(creator, /Cliente sin cuenta/);
  for (const name of ["business_name", "responsible_name", "phone", "address"]) {
    assert.match(creator, new RegExp(`name="${name}"`));
  }
});

test("la interfaz selecciona productos, unidades y cantidades permitidas", () => {
  assert.match(creator, /products\.map/);
  assert.match(creator, /product\?\.allowedUnits/);
  assert.match(creator, /min=\{allowedUnit\?\.minQuantity/);
  assert.match(creator, /step=\{allowedUnit\?\.quantityStep/);
});

test("la acción valida autenticación, autorización e inputs en servidor", () => {
  assert.match(actions, /requireRoleAccess\("\/pedidos"\)/);
  assert.match(actions, /parseInternalOrderFormData\(formData\)/);
  assert.match(actions, /create_qb(?:17)?_internal_catalog_order/);
});

test("la RPC es SECURITY DEFINER con search_path seguro y rol administrativo", () => {
  assert.match(migration, /security definer\s+set search_path = pg_catalog/is);
  assert.match(migration, /v_user_role not in \('admin', 'administrador'\)/);
  assert.doesNotMatch(migration, /set search_path = public/i);
});

test("la RPC conserva identidad registered y guest sin mezclar perfiles", () => {
  assert.match(migration, /p_order_mode not in \('registered', 'guest'\)/);
  assert.match(migration, /public\.customer_accounts/);
  assert.match(migration, /public\.qb_customer_locations/);
  assert.doesNotMatch(migration, /insert into public\.profiles/i);
  assert.doesNotMatch(migration, /insert into public\.customer_accounts/i);
});

test("la creación reutiliza unidades permitidas y snapshots de conversión", () => {
  assert.match(migration, /public\.qb_product_allowed_units/);
  assert.match(migration, /usage_context = 'pedido'/);
  assert.match(migration, /insert into public\.qb_conversion_snapshots/);
  assert.match(migration, /conversion_snapshot_id = v_snapshot_id/);
});

test("crear un pedido no toca stock, pagos, entrega ni recibos", () => {
  assert.doesNotMatch(migration, /stock_current\s*=/i);
  assert.doesNotMatch(migration, /insert into public\.inventory_movements/i);
  assert.doesNotMatch(migration, /insert into public\.payments/i);
  assert.doesNotMatch(migration, /insert into public\.qb_receipts/i);
  assert.doesNotMatch(migration, /confirm_qb_order_delivery\(/i);
});

test("la función no concede ejecución pública ni anónima", () => {
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated;/i);
  assert.match(migration, /grant execute on function[\s\S]*to authenticated;/i);
});

test("el contrato A-O es transaccional y termina en rollback", () => {
  assert.match(sqlContract, /\nbegin;/i);
  assert.match(sqlContract, /QB-OPS-QA-/);
  assert.match(sqlContract, /public\.create_qb_internal_catalog_order/);
  assert.match(sqlContract, /public\.save_qb_order_preparation/);
  assert.match(sqlContract, /public\.confirm_qb_order_delivery/);
  assert.match(sqlContract, /public\.create_qb_receipt_draft/);
  assert.match(sqlContract, /rollback;\s*$/i);
});

test("el contrato verifica stock, idempotencia, recibo y cero pagos", () => {
  assert.match(sqlContract, /stock_after_preparation/);
  assert.match(sqlContract, /stock_after_delivery/);
  assert.match(sqlContract, /movement_count/);
  assert.match(sqlContract, /payment_count_before/);
  assert.match(sqlContract, /delivered_base_quantity/);
});

test("la pantalla carga clientes y ubicaciones solo cuando se solicitan", () => {
  assert.match(data, /includeCreationData/);
  assert.match(data, /getInternalOrderCreationData/);
  assert.match(data, /customer_accounts/);
  assert.match(data, /qb_customer_locations/);
  assert.match(data, /!\/\^bs\\\.\?\$\/i/);
  assert.match(migration, /unsupported_amount_mode/);
});
