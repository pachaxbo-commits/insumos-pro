import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260825020000_qb_safe_order_test_reset.sql",
    import.meta.url,
  ),
  "utf8",
);
const physicalUnitMigration = await readFile(
  new URL(
    "../supabase/migrations/20260825020200_qb_physical_unit_before_price.sql",
    import.meta.url,
  ),
  "utf8",
);

test("el reinicio exige service_role y una confirmación exacta", () => {
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /BORRAR_TODOS_LOS_PEDIDOS/);
  assert.match(
    migration,
    /revoke all on function public\.reset_qb_order_test_data\(text\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.reset_qb_order_test_data\(text\)[\s\S]*to service_role/,
  );
});

test("el reinicio restaura stock antes de retirar movimientos de entrega", () => {
  const restoreIndex = migration.indexOf(
    "set stock_current = stock_current + v_stock.quantity",
  );
  const bridgeDeleteIndex = migration.indexOf(
    "delete from public.qb_order_delivery_movements",
  );
  const movementDeleteIndex = migration.indexOf(
    "delete from public.inventory_movements movement",
  );

  assert.ok(restoreIndex > 0);
  assert.ok(bridgeDeleteIndex > restoreIndex);
  assert.ok(movementDeleteIndex > bridgeDeleteIndex);
});

test("el reinicio conserva catálogo y clientes", () => {
  assert.doesNotMatch(migration, /delete from public\.products/);
  assert.doesNotMatch(migration, /delete from public\.customer_accounts/);
  assert.doesNotMatch(migration, /truncate table public\.products/);
  assert.doesNotMatch(migration, /truncate table public\.customer_accounts/);
  assert.match(migration, /preserved_products/);
  assert.match(migration, /preserved_customers/);
});

test("todas las eliminaciones masivas declaran un alcance explícito", () => {
  assert.doesNotMatch(
    migration,
    /delete from (?:public|private)\.[a-z_]+\s*;/i,
  );
  assert.match(migration, /delete from public\.qb_orders where true/);
  assert.match(migration, /delete from public\.qb_receipts where true/);
});

test("la auditoría detecta BS y precios base pendientes en todo el catálogo", () => {
  assert.match(migration, /La unidad base es monetaria/);
  assert.match(migration, /BS\/BOB está permitido como unidad al crear pedidos/);
  assert.match(migration, /Sin precio base positivo/);
  assert.match(migration, /catalog_conflicts/);
});

test("BS deja de ser una unidad física y la unidad se define antes del precio", () => {
  assert.match(physicalUnitMigration, /supports_amount_bs/);
  assert.match(physicalUnitMigration, /enforce_qb_physical_product_units/);
  assert.match(physicalUnitMigration, /enforce_qb_physical_order_unit/);
  assert.match(physicalUnitMigration, /sync_qb_price_unit_for_orders/);
  assert.match(
    physicalUnitMigration,
    /update public\.qb_product_allowed_units[\s\S]*set is_active = false[\s\S]*usage_context = 'pedido'/,
  );
});
