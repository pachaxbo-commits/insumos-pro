import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [migration, atomicMigration, matrixData, matrixUi, productActions, productForm, newProduct] =
  await Promise.all([
    read("supabase/migrations/20260724090000_qb_excel_catalog_colors.sql"),
    read("supabase/migrations/20260724090100_qb_product_color_atomic_save.sql"),
    read("src/lib/operational-matrix/data.ts"),
    read("src/components/operational-matrix/operational-matrix.tsx"),
    read("src/lib/products/actions.ts"),
    read("src/components/products/product-management.tsx"),
    read("src/components/products/new-product-dialog.tsx"),
  ]);

test("the Excel catalog import is explicit, idempotent and complete", () => {
  assert.match(migration, /QB Insumos - Órdenes\.xlsx/);
  assert.match(migration, /create temporary table qb_excel_catalog_import/);
  assert.match(migration, /imported_count <> 159 or colored_count <> 159/);
  assert.match(migration, /'products', 159/);
  assert.match(migration, /'product_unit_rows', 233/);
  assert.match(migration, /where not exists \(\s*select 1\s*from public\.products/s);
  assert.match(migration, /on conflict \(product_id\) do update/);
});

test("the imported catalog preserves representative source colors", () => {
  assert.match(migration, /'BROCOLI'.*'#7CE175'/);
  assert.match(migration, /'BERENJENA'.*'#DFB1EC'/);
  assert.match(migration, /'TOMATE'.*'#F7ABA6'/);
  assert.match(migration, /'LECHUGA ESCAROLA'.*'#B9EEEF'/);
  assert.match(migration, /'PIMENTON VERDE'.*'#A5DFA7'/);
});

test("products expose a validated editable matrix color", () => {
  assert.match(migration, /add column if not exists matrix_color text/);
  assert.match(migration, /products_matrix_color_check/);
  assert.match(productActions, /matrix_color: z/);
  assert.match(productActions, /\^#\[0-9a-fA-F\]\{6\}\$/);
  assert.match(productActions, /p_matrix_color: parsed\.data\.matrix_color\.toUpperCase\(\)/);
  assert.doesNotMatch(productActions, /\.from\("products"\)\s*\.update\(\{ matrix_color/);
  assert.match(atomicMigration, /set matrix_color = v_matrix_color/);
  assert.match(atomicMigration, /v_product_id := public\.save_qb_product_with_units/);
  assert.match(productForm, /name="matrix_color"/);
  assert.match(newProduct, /name="matrix_color"/);
  assert.match(productForm, /type="color"/);
});

test("the operational matrix paints the complete product row", () => {
  assert.match(matrixData, /product:products\(name, matrix_color,/);
  assert.match(matrixData, /productColor:/);
  assert.match(matrixUi, /data-product-color=\{row\.productColor/);
  assert.match(matrixUi, /backgroundColor: row\.productColor/);
  assert.match(matrixUi, /backgroundColor: line\.productColor/);
  assert.match(matrixUi, /productColor=\{row\.productColor\}/);
});
