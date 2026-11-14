import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const form = readFileSync("src/components/settings/test-data-reset-form.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261114103000_qb_owner_cleanup_explicit_predicates.sql",
  "utf8",
);
const countMigration = readFileSync(
  "supabase/migrations/20261114104000_qb_owner_cleanup_total_inventory_counts.sql",
  "utf8",
);

test("Solo stock bloquea pedidos y movimientos de entrega dependientes", () => {
  assert.match(form, /previews\.orders_stock\.orders > 0/);
  assert.match(form, /previews\.stock\.delivery_stock_movements > 0/);
  assert.match(form, /disabled=\{stockHasDependencies\}/);
  assert.match(form, /Solo stock está bloqueado\. Elige Pedidos \+ stock\./);
});

test("la limpieza total usa predicados explícitos para cada borrado completo", () => {
  assert.doesNotMatch(migration, /^\s*delete from [\w.]+;\s*$/im);
  assert.match(migration, /delete from public\.orders where true;/i);
  assert.match(migration, /delete from public\.inventory_movements where true;/i);
});

test("la limpieza integral captura los conteos antes de revertir los movimientos vinculados", () => {
  const capture = countMigration.indexOf(
    "select count(*) into v_deleted_movements from public.inventory_movements;",
  );
  const linkedDelete = countMigration.indexOf(
    "delete from public.inventory_movements where id=any(v_movements);",
  );
  assert.ok(capture >= 0 && linkedDelete > capture);
  assert.match(countMigration, /select count\(\*\) into v_deleted_merchandise from public\.qb_merchandise_receipts;/);
  assert.match(countMigration, /select count\(\*\) into v_deleted_lots from public\.inventory_lots;/);
  assert.match(countMigration, /select count\(\*\) into v_zeroed_products from public\.products/);
});
