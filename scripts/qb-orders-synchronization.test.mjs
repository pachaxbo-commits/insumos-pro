import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const syncHook = read("src/components/qb-orders/use-qb-orders-synchronization.ts");
const ordersUi = read("src/components/qb-orders/qb-orders-management.tsx");
const ordersData = read("src/lib/qb-orders/data.ts");
const ordersActions = read("src/lib/qb-orders/actions.ts");
const orderTypes = read("src/types/qb-orders.ts");
const productUi = read("src/components/products/product-management.tsx");
const productData = read("src/lib/products/data.ts");
const productActions = read("src/lib/products/actions.ts");
const migration = read("supabase/migrations/20260712092900_qb_orders_realtime_units_guard.sql");
const preparationMigration = read("supabase/migrations/20260712090900_qb6_order_preparation_delivery.sql");
const realtimePublicationBlock = migration.match(/foreach v_table_name[\s\S]*?end loop;/)?.[0] ?? "";

const realtimeTables = [
  "qb_orders",
  "qb_order_items",
  "qb_order_preparations",
  "qb_order_preparation_items",
  "qb_order_delivery_movements",
];

test("01 pedidos se recargan desde el servidor y no desde el payload Realtime", () => {
  assert.match(syncHook, /router\.refresh\(\)/);
  assert.doesNotMatch(syncHook, /payload\.(new|old)/);
  assert.match(ordersData, /unstable_noStore/);
});
test("02 usa la sesión normal y el cliente público del navegador", () => {
  assert.match(syncHook, /createSupabaseBrowserClient/);
  assert.doesNotMatch(syncHook, /service[_-]?role/i);
});
test("03 existe un único canal con nombre estable", () => {
  assert.equal((syncHook.match(/\.channel\("qb-orders-operational-sync"\)/g) ?? []).length, 1);
});
test("04 observa únicamente las cinco tablas operativas", () => {
  for (const table of realtimeTables) assert.match(syncHook, new RegExp(`table: "${table}"`));
  assert.equal((syncHook.match(/postgres_changes/g) ?? []).length, 5);
});
test("05 desmontar elimina el canal", () => assert.match(syncHook, /removeChannel\(channel\)/));
test("06 eventos cercanos se agrupan con debounce", () => {
  assert.match(syncHook, /REFRESH_DEBOUNCE_MS = 750/);
  assert.match(syncHook, /clearTimeout\(refreshTimerRef\.current\)/);
});
test("07 el fallback visible usa 15 segundos", () => {
  assert.match(syncHook, /POLLING_INTERVAL_MS = 15_000/);
  assert.match(syncHook, /document\.visibilityState !== "visible"/);
});
test("08 recuperar foco refresca", () => assert.match(syncHook, /addEventListener\("focus", handleFocus\)/));
test("09 volver a la pestaña refresca", () => assert.match(syncHook, /visibilitychange/));
test("10 reconexión y pérdida de red están controladas", () => {
  assert.match(syncHook, /addEventListener\("online", handleOnline\)/);
  assert.match(syncHook, /addEventListener\("offline", handleOffline\)/);
  assert.match(syncHook, /!navigator\.onLine/);
  assert.match(ordersUi, /Los datos visibles pueden estar desactualizados/);
});
test("11 existe respaldo manual", () => {
  assert.match(syncHook, /refreshManually/);
  assert.match(ordersUi, /: "Actualizar"/);
});
test("12 la interfaz informa estado y última actualización", () => {
  assert.match(ordersUi, /Sincronización activa/);
  assert.match(ordersUi, /Actualizado hace unos segundos/);
});
test("13 una edición local no se borra por eventos remotos", () => {
  assert.match(syncHook, /hasUnsavedChangesRef\.current && !force/);
  assert.match(syncHook, /setRemoteChangePending\(true\)/);
});
test("14 el conflicto remoto bloquea la confirmación", () => {
  assert.match(ordersUi, /disabled=\{pending \|\| synchronizationBlocked\}/);
  assert.match(ordersUi, /El pedido cambió en otro dispositivo/);
});
test("15 descartar y actualizar es una acción explícita", () => {
  assert.match(ordersUi, /Descartar cambios y actualizar/);
  assert.match(ordersUi, /setEditorResetToken/);
});
test("16 cada mutación envía la versión observada", () => {
  assert.match(orderTypes, /updatedAt: string/);
  assert.ok((ordersUi.match(/name="expected_updated_at"/g) ?? []).length >= 4);
});
test("17 el servidor rechaza una versión obsoleta", () => {
  assert.match(ordersActions, /start_qb_order_preparation_versioned/);
  assert.match(ordersActions, /save_qb_order_preparation_versioned/);
  assert.match(migration, /where qb_order\.id = p_order_id[\s\S]*for update;[\s\S]*v_updated_at is distinct from p_expected_updated_at/);
  assert.match(orderTypes, /refreshRequired\?: boolean/);
});
test("18 los conflictos se explican profesionalmente y fuerzan recarga", () => {
  assert.match(ordersActions, /El pedido cambió en otro dispositivo\. Actualiza la vista antes de continuar\./);
  assert.match(ordersActions, /code === "40001"/);
  assert.match(ordersActions, /refreshRequired/);
});
test("19 los RPC existentes conservan locks e idempotencia", () => {
  assert.match(preparationMigration, /from public\.qb_orders[\s\S]*for update/);
  assert.match(preparationMigration, /qb_order_delivery_movements_item_unique/);
});
test("20 Realtime publica las cinco tablas y ninguna tabla de clientes", () => {
  for (const table of realtimeTables) assert.match(realtimePublicationBlock, new RegExp(`'${table}'`));
  assert.doesNotMatch(realtimePublicationBlock, /customer_accounts|profiles|qb_customer_locations/);
});
test("21 la unidad del listado prioriza la configuración QB canónica", () => {
  assert.match(productUi, /base_inventory_unit_id[\s\S]*inventory_unit_id[\s\S]*base_unit_id/);
  assert.match(productUi, /qbUnitsById\.get\(unitId\)\?\.symbol/);
  assert.doesNotMatch(productUi, /product\.unit\?\.abbreviation \?\? "N\/D"/);
});
test("22 productos con movimientos muestran y aplican el bloqueo", () => {
  assert.match(productData, /inventory_movements/);
  assert.match(productUi, /productIdsWithMovements/);
  assert.match(productUi, /No puedes cambiar la unidad base porque este producto ya tiene movimientos de inventario\./);
});
test("23 producto y unidades se guardan en una RPC transaccional", () => {
  assert.match(productActions, /rpc\("save_qb_product_with_units"/);
  assert.match(migration, /insert into public\.products[\s\S]*insert into public\.qb_product_unit_settings/);
});
test("24 la base bloquea unidad general y unidad canónica", () => {
  assert.match(migration, /before update of unit_id on public\.products/);
  assert.match(migration, /before update of base_unit_id, inventory_unit_id, base_inventory_unit_id/);
});
test("25 productos sin movimientos requieren confirmación para cambiar unidad", () => {
  assert.match(productUi, /window\.confirm\("¿Confirmas el cambio de unidad base para este producto sin movimientos\?"\)/);
});
test("26 el SKU nuevo no hereda otro producto", () => {
  assert.match(productUi, /defaultValue=\{product\?\.sku \?\? ""\}/);
  assert.doesNotMatch(productUi, /defaultValue=\{products\[0\].*sku/);
});
test("27 nuevo producto usa unidades canónicas base inventario y precio", () => {
  assert.match(productUi, /name=\{unitLocked \? undefined : "base_unit_id"\}/);
  assert.match(productUi, /name=\{unitLocked \? undefined : "inventory_unit_id"\}/);
  assert.match(productUi, /name="price_unit_id"/);
  assert.match(productUi, /availableQbUnits/);
});
test("28 la RPC solo permite administrador y no concede ejecución a anon", () => {
  assert.match(migration, /v_role not in \('admin', 'administrador'\)/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to authenticated/);
});
test("29 las cuatro transiciones usan locks y una versión dentro de la misma transacción", () => {
  for (const operation of ["start_qb_order_preparation", "save_qb_order_preparation", "confirm_qb_order_delivery", "cancel_qb_order_before_delivery"]) {
    assert.match(migration, new RegExp(`function public\\.${operation}_versioned`));
    assert.match(ordersActions, new RegExp(`rpc\\("${operation}_versioned"`));
  }
  assert.equal((migration.match(/for update;/g) ?? []).length, 5);
  assert.equal((migration.match(/using errcode = '40001'/g) ?? []).length, 4);
  assert.equal((migration.match(/No tienes permisos para modificar pedidos QB\./g) ?? []).length, 4);
  assert.match(migration, /security definer[\s\S]*public\.profiles[\s\S]*'administrador', 'inventario'/);
});
