import assert from "node:assert/strict";
import { coveragePresentation } from "../src/lib/operational-matrix/coverage-presentation.ts";

const make = (status, quantity) => coveragePresentation({
  status,
  ...(status === "short" ? { missingBaseQuantity: quantity } : {}),
  ...(status === "over" ? { excessBaseQuantity: quantity } : {}),
  baseUnitSymbol: "KG",
});

assert.deepEqual(make("complete"), { status: "complete", label: "COMPLETO", missingBaseQuantity: 0, excessBaseQuantity: 0 });
assert.equal(make("short", 12).label, "FALTA 12 KG");
assert.equal(make("short", 20).label, "FALTA 20 KG");
assert.equal(make("over", 2).label, "REVISAR · excede 2 KG");
assert.equal(make("unverified").label, "REVISAR · conversión no verificable");
console.log("PASS: etiquetas de cobertura completa, parcial, cero, exceso y conversión inválida");
