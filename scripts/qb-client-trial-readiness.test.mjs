import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("la hoja de compras usa una suma aditiva y explica la fecha automática", () => {
  const model = read("src/lib/market-sheet/model.ts");
  const page = read("src/app/(private)/matriz-operativa/mercado/page.tsx");
  const workbook = read("src/lib/market-sheet/workbook.ts");
  assert.match(model, /totalLineCount: customerLineCounts\.reduce/);
  assert.match(page, /LÍNEAS PEDIDAS/);
  assert.match(workbook, /LÍNEAS PEDIDAS/);
  assert.match(page, /fecha más reciente con pedidos/);
});

test("recibos explica el requisito previo cuando todavía está vacío", () => {
  const receipts = read("src/components/qb-receipts/qb-receipts-management.tsx");
  assert.match(receipts, /Todavía no hay entregas listas para generar recibo/);
  assert.match(receipts, /Inventario completa y finaliza la preparación/);
  assert.match(receipts, /El entregador registra las cantidades reales y confirma la entrega/);
  assert.match(receipts, /href="\/matriz-operativa"/);
});

test("el reordenamiento usa alias explícitos de unnest con ordinalidad", () => {
  const migration = read("supabase/migrations/20260926010000_qb_client_trial_readiness.sql");
  assert.match(migration, /with ordinality as item\(order_id, position\)/);
  assert.match(migration, /select item\.order_id, item\.position::integer/);
  assert.doesNotMatch(migration, /select value as order_id/);
});

test("el menú no ofrece enlaces que el rol no puede abrir", () => {
  const sidebar = read("src/components/layout/app-sidebar.tsx");
  assert.match(sidebar, /dailyFlow[\s\S]*canAccessPath\(user\.role, item\.href\)/);
  assert.match(sidebar, /dailyFlow\.map/);
});
