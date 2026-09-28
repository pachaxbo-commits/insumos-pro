import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const matrix = readFileSync(
  "src/components/operational-matrix/operational-matrix.tsx",
  "utf8",
);
const data = readFileSync("src/lib/operational-matrix/data.ts", "utf8");

test("todos los productos muestran una cantidad real con su unidad", () => {
  assert.match(matrix, /function QuantityEditor/);
  assert.equal(matrix.match(/sourceLabel=\{line\.sourceLabel\}/g)?.length, 3);
  assert.match(matrix, /quantityValue=\{line\.preparedQuantity\}/);
  assert.match(matrix, /quantityValue=\{line\.deliveredQuantity\}/);
});

test("la entrada acepta teclado numérico, punto y coma decimal", () => {
  assert.match(matrix, /function DecimalInput/);
  assert.match(matrix, /type="text"/);
  assert.match(matrix, /inputMode="decimal"/);
  assert.match(matrix, /replace\(",", "\."\)/);
  assert.match(matrix, /\^\\d\*\(\?:\[\.,\]\\d\*\)\?\$/);
  assert.doesNotMatch(matrix, /step="0\.5"/);
});

test("el selector usa todas las unidades activas de peso parametrizadas", () => {
  assert.match(data, /row\.code === "peso"/);
  assert.match(data, /conversion_factor_to_base/);
  assert.match(matrix, /weightUnits\.map\(\(option\) =>/);
  assert.doesNotMatch(matrix, /const WEIGHT_UNITS =/);
});

test("la unidad solicitada tiene prioridad sobre la unidad base", () => {
  assert.match(matrix, /for \(const label of labels\)/);
  assert.match(data, /for \(const label of labels\)/);
  assert.doesNotMatch(matrix, /const candidates = new Set/);
  assert.doesNotMatch(data, /const candidates = new Set/);
  assert.match(
    matrix,
    /sourceLabel,\s+sourceUnitHint/,
  );
});

test("editar cantidades conserva el estado actual de los checks", () => {
  assert.doesNotMatch(matrix, /preparationCheck: false/);
  assert.doesNotMatch(matrix, /deliveryCheck: false/);
  assert.doesNotMatch(matrix, /preparationCheck: value !== null/);
  assert.doesNotMatch(matrix, /deliveryCheck: value !== null/);
});

test("cantidad comercial y peso real permanecen visibles y editables", () => {
  assert.match(matrix, /quantityLabel = "Cantidad real"/);
  assert.match(matrix, /quantityLabel=\{stage === "preparacion" \? "Cantidad preparada" : "Cantidad entregada"\}/);
  assert.match(matrix, />\s*Peso real\s*</);
  assert.match(matrix, /value=\{quantityValue\}/);
  assert.match(matrix, /value=\{displayWeight\}/);
});

test("entrega compara lo preparado con el valor final editable", () => {
  assert.match(
    matrix,
    /"CHECK INV\.\/ENT\.",\s+"PREPARADO",\s+"ENTREGADO REAL"/,
  );
  assert.match(matrix, /function PreparedMeasurementDisplay/);
  assert.match(matrix, /line\.preparationActualWeightKg/);
  assert.match(matrix, /actualWeightKg=\{line\.deliveryActualWeightKg\}/);
});

test("resumen separa cantidad y peso reales entregados", () => {
  assert.match(
    matrix,
    /"SOLICITADO",\s+"CHECK",\s+"CANT\. REAL ENTREGADA",\s+"PESO REAL ENTREGADO"/,
  );
  assert.match(matrix, /formatQuantity\(line\.deliveredQuantity\)/);
  assert.match(matrix, /formatQuantity\(line\.deliveryActualWeightKg\)/);
});

test("las observaciones conservan los espacios escritos", () => {
  assert.match(matrix, /const comparisonKey = value\.trim\(\)/);
  assert.match(matrix, /result\.push\(value\)/);
  assert.doesNotMatch(
    matrix,
    /new Set\(values\.map\(\(value\) => value\.trim\(\)\)/,
  );
});

test("editar solamente el peso conserva la cantidad y el check", () => {
  assert.match(
    matrix,
    /onWeightChange=\{\(value\) =>\s+onChange\(\{\s+preparationActualWeightKg: value,\s+\}\)/,
  );
  assert.match(
    matrix,
    /onWeightChange=\{\(value\) =>\s+onChange\(\{\s+deliveryActualWeightKg: value,\s+\}\)/,
  );
});

test("la cantidad preparada agrupada se distribuye entre pedidos", () => {
  assert.match(matrix, /const preparationQuantities =/);
  assert.match(
    matrix,
    /distributeValue\(groupedLines, patch\.preparedQuantity\)/,
  );
  assert.match(
    matrix,
    /next\.preparedQuantity = preparationQuantities\[index\]/,
  );
});

test("un check manual sin cantidad toma por defecto lo solicitado", () => {
  assert.match(
    matrix,
    /checked && line\.preparedQuantity <= 0\.000001[\s\S]*preparedQuantity: line\.requestedQuantity/,
  );
  assert.match(
    matrix,
    /checked && line\.deliveredQuantity <= 0\.000001[\s\S]*line\.requestedQuantity/,
  );
  assert.match(matrix, /requestedWeightInKilograms\(line, weightUnits\)/);
  assert.match(matrix, /weightToKilograms\(line\.requestedQuantity, unit\)/);
});

test("los checks ya guardados con cero se normalizan para el resumen", () => {
  assert.match(data, /requested_quantity, base_quantity/);
  assert.match(
    data,
    /preparationCheck && rawPreparedQuantity <= 0\.000001[\s\S]*requestedQuantity/,
  );
  assert.match(
    data,
    /deliveryCheck && rawDeliveredQuantity <= 0\.000001[\s\S]*requestedQuantity/,
  );
});
