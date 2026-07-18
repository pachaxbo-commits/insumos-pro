import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getActiveReceptionSources } from "../src/lib/qb-ingresos/reception-sources.ts";

const productId = "10000000-0000-4000-8000-000000000001";
const presentationId = "20000000-0000-4000-8000-000000000001";
const allowedId = "30000000-0000-4000-8000-000000000001";
const kgId = "40000000-0000-4000-8000-000000000001";

const presentation = {
  id: presentationId,
  product_id: productId,
  name: "Carga",
  symbol: "carga",
  base_unit_id: kgId,
  conversion_factor_to_base: 112.5,
  allow_purchase: true,
  allow_order: false,
  allow_sale: false,
  allow_inventory: false,
  is_active: true,
};

test("exclusive receiving presentation is eligible without order inventory or receipt permission", () => {
  const result = getActiveReceptionSources({
    productId,
    allowedUnits: [{
      id: allowedId,
      product_id: productId,
      usage_context: "recepcion",
      presentation_id: presentationId,
      unit_id: null,
      is_active: true,
      sort_order: 0,
    }],
    presentations: [presentation],
    units: [{ id: kgId, is_active: true }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, allowedId);
});

test("inactive, wrong-product and non-receiving relations remain unavailable", () => {
  const allowedUnits = [
    { id: "inactive", product_id: productId, usage_context: "recepcion", presentation_id: presentationId, unit_id: null, is_active: false, sort_order: 0 },
    { id: "order", product_id: productId, usage_context: "pedido", presentation_id: presentationId, unit_id: null, is_active: true, sort_order: 0 },
    { id: "other", product_id: "other", usage_context: "recepcion", presentation_id: presentationId, unit_id: null, is_active: true, sort_order: 0 },
  ];
  assert.deepEqual(getActiveReceptionSources({ productId, allowedUnits, presentations: [presentation], units: [] }), []);
});

test("one load converts to 112.5 kg and 0/60/40 conserves the total", () => {
  const total = 1 * presentation.conversion_factor_to_base;
  const quantities = [0, 60, 40].map((percentage) => total * percentage / 100);
  assert.equal(total, 112.5);
  assert.deepEqual(quantities, [0, 67.5, 45]);
  assert.equal(quantities.reduce((sum, quantity) => sum + quantity, 0), total);
});

test("migration syncs only reception from allow_purchase without duplicating presentations", () => {
  const migration = readFileSync(
    "supabase/migrations/20260718173000_qb_receiving_presentation_sync.sql",
    "utf8",
  );
  assert.match(migration, /new\.is_active and new\.allow_purchase/);
  assert.match(migration, /'recepcion'/);
  assert.match(migration, /on conflict \(product_id, usage_context, presentation_id\)/);
  assert.doesNotMatch(migration, /insert into public\.qb_product_presentations/i);
});

test("UI explains loading empty and error states and refreshes ingresos", () => {
  const component = readFileSync("src/components/qb-ingresos/qb-ingresos-management.tsx", "utf8");
  const loading = readFileSync("src/app/(private)/ingresos/loading.tsx", "utf8");
  const actions = readFileSync("src/lib/products/actions.ts", "utf8");
  const ingresoActions = readFileSync("src/lib/qb-ingresos/actions.ts", "utf8");
  assert.match(component, /Este producto no tiene una presentación de recepción activa\./);
  assert.match(component, /No pudimos cargar las presentaciones\. Intenta nuevamente\./);
  assert.match(loading, /Cargando presentaciones…/);
  assert.match(component, /presentation\.name} —/);
  assert.match(actions, /revalidatePath\("\/ingresos"\)/);
  assert.match(ingresoActions, /conversion_factor_to_base, allow_purchase, is_active/);
  assert.match(ingresoActions, /!presentationResult\.data\.allow_purchase/);
});
