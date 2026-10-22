import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20261022100000_qb_inventory_kardex_read.sql", import.meta.url), "utf8");
const data = readFileSync(new URL("../src/lib/inventory/kardex-data.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/(private)/stock/page.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/stock/stock-workspace.tsx", import.meta.url), "utf8");
const exportRoute = readFileSync(new URL("../src/app/api/stock/kardex.xlsx/route.ts", import.meta.url), "utf8");
const integration = readFileSync(new URL("./qb-stock-kardex.integration.sql", import.meta.url), "utf8");

test("stock current is read from products and selected fields exclude financial values", () => {
  assert.match(data, /from\("products"\)[\s\S]*select\("id,name,category_id,stock_current,stock_min,is_active,category:product_categories\(name\)"\)/);
  assert.doesNotMatch(data, /sale_price|purchase_price|margin|supplier_name/);
  assert.match(workspace, /Stock actual/);
});

test("Kardex is based on one inventory movement row with receipt and delivery links", () => {
  assert.match(migration, /from public\.inventory_movements movement/);
  assert.match(migration, /receipt_movement\.inventory_movement_id = movement\.id/);
  assert.match(migration, /delivery\.inventory_movement_id = movement\.id/);
  assert.match(migration, /inventory_movement_id is null/);
  assert.match(migration, /union all/);
  assert.match(migration, /movement_role = 'loss'/);
});

test("Kardex does not expose FIFO lot costs, margins, or sales amounts", () => {
  assert.match(migration, /inventory_lot_consumptions consumption/);
  assert.match(migration, /historical_unknown/);
  assert.doesNotMatch(migration, /unit_cost|total_cost|sale_price|purchase_price|margin/);
  assert.match(workspace, /Stock histórico sin lote identificable/);
});

test("read RPC enforces active administrator or inventory roles and invokes with pagination", () => {
  assert.match(migration, /security invoker/);
  assert.match(migration, /v_role not in \('admin', 'administrador', 'inventario'\)/);
  assert.match(migration, /grant execute on function public\.get_qb_inventory_kardex[\s\S]*to authenticated/);
  assert.match(data, /p_page_size: filters\.pageSize/);
  assert.match(data, /p_offset: \(filters\.page - 1\) \* filters\.pageSize/);
  assert.match(page, /requireRoleAccess\("\/stock"\)/);
});

test("date window is converted from the Bolivia operational timezone and sorts both directions", () => {
  assert.match(migration, /America\/La_Paz/);
  assert.match(migration, /p_order = 'asc'/);
  assert.match(migration, /p_order = 'desc'/);
  assert.match(workspace, /Más recientes/);
  assert.match(workspace, /Más antiguos/);
  assert.match(workspace, /type="month"/);
});

test("existence table filters product and category while preserving active balance", () => {
  assert.match(workspace, /Buscar producto o categoría/);
  assert.match(workspace, /Todas las categorías/);
  assert.match(workspace, /summary\?\.inbound/);
  assert.match(workspace, /summary\?\.outbound/);
  assert.match(workspace, /summary\?\.waste/);
  assert.match(workspace, /summary\?\.adjustment/);
});

test("Excel export is role protected and exports all matching pages without financial columns", () => {
  assert.match(exportRoute, /requireRoleAccess\("\/stock"\)/);
  assert.match(exportRoute, /for \(let page = 2; page <= Math\.ceil\(firstPage\.data\.total \/ filters\.pageSize\)/);
  assert.match(exportRoute, /Resumen por producto/);
  assert.doesNotMatch(exportRoute, /sale_price|purchase_price|margin|unit_cost|total_cost/);
  assert.match(workspace, /api\/stock\/kardex\.xlsx/);
});

test("isolated PostgreSQL fixture covers accumulated stock, date filters and server pagination with rollback", () => {
  assert.match(integration, /'entrada',10,0,10/);
  assert.match(integration, /'salida',4,10,6/);
  assert.match(integration, /'entrada',5,6,11/);
  assert.match(integration, /'salida',7,11,4/);
  assert.match(integration, /stock_current.*\)::numeric <> 4/);
  assert.match(integration, /'2026-10-21','2026-10-22',v_product,'all',null,'asc',1,0/);
  assert.match(integration.trimEnd(), /rollback;/i);
});
