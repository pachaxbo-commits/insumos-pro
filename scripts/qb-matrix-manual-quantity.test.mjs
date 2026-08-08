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
  assert.equal(matrix.match(/unitLabel=\{line\.sourceLabel\}/g)?.length, 2);
  assert.match(matrix, /value=\{line\.preparedQuantity\}/);
  assert.match(matrix, /value=\{line\.deliveredQuantity\}/);
});

test("la entrada acepta teclado numérico, punto y coma decimal", () => {
  assert.match(matrix, /function DecimalInput/);
  assert.match(matrix, /type="text"/);
  assert.match(matrix, /inputMode="decimal"/);
  assert.match(matrix, /replace\(",", "\."\)/);
  assert.match(matrix, /\^\\d\*\(\?:\[\.,\]\\d\*\)\?\$/);
  assert.doesNotMatch(matrix, /step="0\.5"/);
});

test("editar cantidades nunca activa automáticamente los checks", () => {
  assert.match(
    matrix,
    /preparedQuantity: value \?\? 0,\s+preparationCheck: false/,
  );
  assert.match(
    matrix,
    /deliveredQuantity: value \?\? 0,\s+deliveryCheck: false/,
  );
  assert.doesNotMatch(matrix, /preparationCheck: value !== null/);
  assert.doesNotMatch(matrix, /deliveryCheck: value !== null/);
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
  assert.match(matrix, /line\.requestedBaseQuantity/);
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
