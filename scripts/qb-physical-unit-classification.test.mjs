import assert from "node:assert/strict";
import { classifyPhysicalProduct } from "../src/lib/products/physical-unit-correction-classification.ts";

assert.equal(classifyPhysicalProduct("10 Verduras", "ARVEJA"), "solid");
assert.equal(classifyPhysicalProduct("08 Frutas frescas", "PERA DE AGUA"), "solid");
assert.equal(classifyPhysicalProduct("09 Hierbas frescas", "MANZANILLA"), "solid");
assert.equal(classifyPhysicalProduct("Líquidos", "AGUA MINERAL"), "liquid");
assert.equal(classifyPhysicalProduct("Abarrotes", "ACEITE VEGETAL"), "liquid");
assert.equal(classifyPhysicalProduct("Varios", "PRODUCTO ESPECIAL"), "review");
console.log("OK: la clasificación no confunde fruta con agua y deja ambiguos en revisión.");
