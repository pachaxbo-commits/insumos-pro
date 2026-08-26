import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const management = read("src/components/products/product-management.tsx");
const editor = read("src/components/products/product-pricing-editor.tsx");
const actions = read("src/lib/products/actions.ts");
const migration = read(
  "supabase/migrations/20260812010300_qb_product_weight_pricing_admin.sql",
);
const priceAuditMigration = read(
  "supabase/migrations/20260712092400_qb17_operational_price_management.sql",
);

test("Productos muestra unidad y precio base dentro de Editar producto", () => {
  assert.match(management, /<ProductPricingEditor/);
  assert.match(
    management,
    /¿En qué unidad se entrega y cobra\?[\s\S]*name="price_unit_id"/,
  );
  assert.match(editor, /Precio base para recibos/);
  assert.match(editor, /1\. ¿En qué unidad se entrega y cobra\?/);
  assert.match(editor, /2\. ¿Cuál es el precio base por esa unidad\?/);
  assert.match(editor, /Primero corrige la unidad física/);
  assert.match(editor, /name="price_unit_id"/);
  assert.match(editor, /name="new_price"/);
  assert.match(editor, /Guardar precio/);
});

test("el guardado de unidad y precio sigue protegido para administrador", () => {
  assert.match(actions, /updateQbProductPricingAction/);
  assert.match(actions, /assertCanManageBasePrices/);
  assert.match(actions, /update_qb_product_pricing_v2/);
  assert.match(migration, /v_role not in \('admin', 'administrador'\)/);
  assert.match(migration, /QB_PRICE_CONCURRENT_CHANGE/);
  assert.match(actions, /validatePhysicalProductUnits/);
  assert.match(actions, /BS representa dinero, no una cantidad física/);
});

test("solo productos con peso real pueden cobrar en una dimensión de peso distinta", () => {
  assert.match(migration, /v_price_unit\.dimension_id <> v_inventory_unit\.dimension_id/);
  assert.match(migration, /v_product\.controls_actual_weight/);
  assert.match(migration, /v_price_dimension_code is distinct from 'peso'/);
  assert.match(migration, /QB_WEIGHT_PRICE_REQUIRES_CONTROL/);
});

test("el cambio guarda unidad y precio juntos y deja auditoría", () => {
  assert.match(
    migration,
    /set base_price_unit_id = v_effective_price_unit_id,[\s\S]*base_sale_price = v_effective_price/,
  );
  assert.match(migration, /update_qb_product_price_unit/);
  assert.match(priceAuditMigration, /audit_qb_product_base_price_change/);
});
