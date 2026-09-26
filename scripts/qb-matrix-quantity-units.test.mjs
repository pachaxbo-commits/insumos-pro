import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { quantityUnitOptions, quantityInOriginalUnit, quantityInSelectedUnit } from "../src/lib/operational-matrix/quantity-units.ts";

const unit = (id, symbol, factor, dimension_id = "peso", is_active = true) => ({
  id, symbol, name: symbol, conversion_factor_to_base: factor, dimension_id, is_active,
});
const units = [unit("kg", "KG", 1), unit("gr", "GR", 0.001), unit("cuartilla", "CUARTILLA", 2.7),
  unit("arroba", "ARROBA", 11.25), unit("unidad", "UNIDAD", 1, "conteo"),
  unit("docena", "DOCENA", 12, "conteo"), unit("lt", "L", 1, "volumen"),
  unit("ml", "ML", 0.001, "volumen"), unit("inactive", "INACTIVA", 3, "peso", false)];
const item = { product_id: "arroz", base_unit_id: "kg", source_unit_id: "cuartilla",
  product_presentation_id: null, source_label: "CUARTILLA", conversion_factor_to_base: 2.7 };

test("arroz y fideo sin control de peso admiten KG, GR y ARROBA", () => {
  for (const product_id of ["arroz", "fideo"]) {
    const options = quantityUnitOptions({ ...item, product_id }, units, []);
    assert.deepEqual(options.map(x => x.label), ["CUARTILLA", "KG", "GR", "ARROBA"]);
    const kg = options.find(x => x.id === "unit:kg");
    assert.equal(quantityInSelectedUnit(1, kg), 2.7);
    assert.equal(quantityInOriginalUnit(5.4, kg), 2);
    assert.equal(quantityInOriginalUnit(null, kg), null);
    assert.equal(quantityInOriginalUnit(0, kg), 0);
  }
});

test("cambiar la unidad de visualización no altera la cantidad guardada", () => {
  for (const option of quantityUnitOptions(item, units, [])) {
    const original = 2;
    assert.ok(Math.abs(quantityInOriginalUnit(quantityInSelectedUnit(original, option), option) - original) < 0.000003);
  }
});

test("conteo y volumen permiten unidades compatibles sin inventar pesos", () => {
  const count = quantityUnitOptions({ ...item, base_unit_id: "unidad", source_unit_id: "unidad", source_label: "UNIDAD", conversion_factor_to_base: 1 }, units, []);
  assert.deepEqual(count.map(x => x.label), ["UNIDAD", "DOCENA"]);
  assert.equal(quantityInOriginalUnit(0.5, count[1]), 6);
  const volume = quantityUnitOptions({ ...item, base_unit_id: "lt", source_unit_id: "lt", source_label: "L", conversion_factor_to_base: 1 }, units, []);
  assert.deepEqual(volume.map(x => x.label), ["L", "ML"]);
  assert.equal(quantityInOriginalUnit(500, volume[1]), 0.5);
});

test("usa la equivalencia histórica del pedido y presentaciones del mismo producto", () => {
  const presentation = { id: "caja", product_id: "arroz", base_unit_id: "kg", symbol: "CAJA", name: "Caja", conversion_factor_to_base: 20, is_active: true };
  const options = quantityUnitOptions({ ...item, conversion_factor_to_base: 3 }, units, [presentation, { ...presentation, id: "ajena", product_id: "otro" }]);
  assert.equal(quantityInOriginalUnit(6, options.find(x => x.id === "unit:kg")), 2);
  assert.equal(quantityInOriginalUnit(1, options.find(x => x.id === "presentation:caja")), 6.666667);
  assert.ok(!options.some(x => x.id === "presentation:ajena"));
});

test("una caja se convierte según su contenido, no como si fuera 1 kg", () => {
  const options = quantityUnitOptions({ ...item, source_unit_id: null, source_label: "CAJA", conversion_factor_to_base: 20 }, units, []);
  const kg = options.find(x => x.id === "unit:kg");
  assert.equal(quantityInSelectedUnit(2, kg), 40);
  assert.equal(quantityInOriginalUnit(10, kg), 0.5);
});

test("factores inválidos no producen conversiones ni divisiones por cero", () => {
  for (const conversion_factor_to_base of [0, -1, NaN, Infinity]) {
    assert.equal(quantityUnitOptions({ ...item, conversion_factor_to_base }, units, []).length, 1);
  }
});

test("unidades importadas antiguas no se tratan como equivalencias 1:1", () => {
  const importedUnits = [...units, unit("legacy-cuartilla", "CUARTILLA", 1, "legacy"), unit("legacy-caja", "CAJA", 1, "legacy")];
  const options = quantityUnitOptions({ ...item, base_unit_id: "legacy-cuartilla", source_unit_id: "legacy-cuartilla", conversion_factor_to_base: 1 }, importedUnits, [], ["peso", "conteo", "volumen"]);
  assert.deepEqual(options.map(x => x.label), ["CUARTILLA", "KG", "GR", "ARROBA"]);
  assert.equal(quantityInSelectedUnit(1, options.find(x => x.id === "unit:kg")), 2.7);
  const unknown = quantityUnitOptions({ ...item, base_unit_id: "legacy-caja", source_label: "CAJA" }, importedUnits, [], ["peso", "conteo", "volumen"]);
  assert.equal(unknown.length, 1);
});

test("ambas etapas usan el selector con y sin control de peso", () => {
  const matrix = readFileSync("src/components/operational-matrix/operational-matrix.tsx", "utf8");
  assert.equal(matrix.match(/quantityUnits=\{line\.quantityUnits\}/g)?.length, 2);
  const editor = matrix.split("function QuantityEditor(")[1].split("function DesktopOrderCells")[0];
  assert.match(editor, /<select/);
  assert.match(editor, /quantityInOriginalUnit\(nextValue, selectedUnit\)/);
  assert.match(editor, /disabled=\{disabled\}/);
  assert.doesNotMatch(editor, /controlsActualWeight/);
});

test("el selector real cambia la visualización y convierte la edición sin modificar CANT", () => {
  const source = readFileSync("src/components/operational-matrix/operational-matrix.tsx", "utf8");
  const helper = source.slice(source.indexOf("function selectedQuantityUnit("), source.indexOf("function aggregateLines("));
  const component = source.slice(source.indexOf("function QuantityEditor("), source.indexOf("function DesktopOrderCells("));
  const code = ts.transpileModule(`export ${helper}\nexport ${component}`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exported = {};
  const DecimalInput = () => null;
  runInNewContext(code, {
    exports: exported, require: createRequire(import.meta.url),
    DecimalInput, quantityInOriginalUnit, quantityInSelectedUnit, formatQuantity: String,
  });
  const find = (node, type) => {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === type) return node;
    return [node.props?.children].flat(Infinity).map(child => find(child, type)).find(Boolean);
  };
  for (const label of ["Cantidad real preparada de Arroz", "Cantidad real entregada de Arroz"]) {
    let saved = 1;
    let changes = 0;
    let selected = "original";
    const props = { label, value: saved, unitLabel: "CUARTILLA", quantityUnits: quantityUnitOptions(item, units, []), selectedUnitId: selected, onChange: value => { saved = value; changes++; }, onUnitChange: value => { selected = value; }, onBlur: () => {}, disabled: false };
    let tree = exported.QuantityEditor(props);
    find(tree, "select").props.onChange({ target: { value: "unit:kg" } });
    assert.equal(changes, 0, "elegir unidad no altera lo preparado o entregado");
    tree = exported.QuantityEditor({ ...props, selectedUnitId: selected });
    assert.equal(find(tree, DecimalInput).props.value, 2.7);
    find(tree, DecimalInput).props.onChange(5.4);
    assert.equal(saved, 2);
    assert.equal(props.value, 1, "la cantidad original no se muta");
    assert.equal(find(exported.QuantityEditor({ ...props, selectedUnitId: selected, disabled: true }), "select").props.disabled, true);
  }
});

test("la unidad elegida se envía, persiste y se recupera en ambas etapas", () => {
  const matrix = readFileSync("src/components/operational-matrix/operational-matrix.tsx", "utf8");
  const actions = readFileSync("src/lib/operational-matrix/actions.ts", "utf8");
  const data = readFileSync("src/lib/operational-matrix/data.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260926010000_qb_client_trial_readiness.sql", "utf8");
  assert.match(matrix, /displayUnitId: line\.preparationDisplayUnitId/);
  assert.match(matrix, /displayUnitId: line\.deliveryDisplayUnitId/);
  assert.match(actions, /save_qb_matrix_preparation_item_with_unit/);
  assert.match(actions, /save_qb_matrix_delivery_item_with_unit/);
  assert.match(data, /display_unit_id/);
  assert.match(migration, /add column if not exists display_unit_id/);
  assert.match(migration, /'preparacion', 'display_unit_id'/);
  assert.match(migration, /'entrega', 'display_unit_id'/);
});
