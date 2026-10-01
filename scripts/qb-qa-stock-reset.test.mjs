import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260930200000_qb_qa_stock_reset.sql", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/lib/test-data-reset/actions.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/(private)/configuracion/datos-prueba/page.tsx", import.meta.url), "utf8");
const form = await readFile(new URL("../src/components/settings/test-data-reset-form.tsx", import.meta.url), "utf8");

test("stock QA remains gated by admin, server flag and exact confirmation", () => {
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /p\.is_active = true and p\.role = 'administrador'/);
  assert.match(migration, /p_confirmation is distinct from 'BORRAR DATOS'/);
  assert.match(migration, /grant execute on function public\.reset_qb_stock_test_data\(uuid, text\) to service_role/);
  assert.match(actions, /if \(!testDataResetEnabled\(\)\)/);
  assert.match(actions, /if \(auth\.user\.role !== "administrador"\)/);
  assert.match(actions, /reset_qb_stock_test_data/);
});

test("stock reset is atomic and clears FIFO, receipts, ledger before balances", () => {
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/);
  const statements = [
    "delete from public.inventory_lot_consumptions where true",
    "delete from public.inventory_lot_writeoffs where true",
    "delete from public.inventory_fifo_consumption_runs where true",
    "delete from public.inventory_lots where true",
    "delete from public.qb_merchandise_receipts where true",
    "delete from public.inventory_movements where true",
    "set stock_current = 0",
  ];
  let previous = -1;
  for (const statement of statements) {
    const position = migration.indexOf(statement);
    assert.ok(position > previous, `${statement} must follow its dependencies`);
    previous = position;
  }
  assert.match(migration, /Limpia primero pedidos y recibos/);
  assert.match(migration, /La verificación de stock en cero falló; se revierte la transacción/);
});

test("catalog, customers, users and configuration are never selected for deletion", () => {
  assert.doesNotMatch(migration, /delete from public\.(products|customer_accounts|profiles|qb_product_unit_settings|qb_units)/i);
  assert.match(migration, /where import_type = 'initial_stock' or receipt_id is not null/);
  assert.match(migration, /where stock_current <> 0/);
});

test("preview and UI expose the stock-only scope", () => {
  assert.match(migration, /stock_products_nonzero/);
  assert.match(migration, /stock_movements/);
  assert.match(migration, /stock_receipts/);
  assert.match(migration, /stock_lots/);
  assert.match(page, /getTestDataResetPreview\("stock"\)/);
  assert.match(form, /setMode\("stock"\)/);
  assert.match(form, /preview\.stock_dependencies > 0/);
});
