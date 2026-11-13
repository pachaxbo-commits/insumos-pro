import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coveragePresentation } from "../src/lib/operational-matrix/coverage-presentation.ts";
const matrix = readFileSync("src/components/operational-matrix/operational-matrix.tsx", "utf8");

const make = (status, phase = "entrega", operationalVerified = false, deliveryState = "pending", quantity = undefined) => coveragePresentation({
  status,
  ...(status === "short" ? { missingBaseQuantity: quantity } : {}),
  ...(status === "over" ? { excessBaseQuantity: quantity } : {}),
  baseUnitSymbol: "KG",
  phase,
  operationalVerified,
  deliveryState,
});

const completePrepPending = make("complete", "preparacion", false);
assert.equal(completePrepPending.quantityLabel, "CANTIDAD COMPLETA");
assert.equal(completePrepPending.verificationLabel, "Preparación: pendiente");
assert.equal(completePrepPending.deliveryLabel, null);
const completePrepChecked = make("complete", "preparacion", true);
assert.equal(completePrepChecked.verificationLabel, "Preparación: marcada");
assert.equal(completePrepChecked.deliveryConfirmed, false);
const deliveryUnchecked = make("complete", "entrega", false, "pending");
assert.equal(deliveryUnchecked.verificationLabel, "Verificación de entrega: pendiente");
assert.equal(deliveryUnchecked.deliveryLabel, "ENTREGA PENDIENTE");
const deliveryCheckedButUnconfirmed = make("complete", "entrega", true, "pending");
assert.equal(deliveryCheckedButUnconfirmed.deliveryConfirmed, false);
const confirmed = make("complete", "resumen", true, "confirmed");
assert.equal(confirmed.deliveryLabel, "ENTREGA CONFIRMADA");
assert.equal(confirmed.deliveryConfirmed, true);
assert.equal(make("short", "entrega", false, "pending", 12).quantityLabel, "FALTA 12 KG");
assert.equal(make("short", "entrega", false, "pending", 20).quantityLabel, "FALTA 20 KG");
assert.equal(make("over", "entrega", false, "pending", 2).quantityLabel, "REVISAR · excede 2 KG");
assert.equal(make("unverified").quantityLabel, "Revisar equivalencia histórica");
assert.equal(make("complete", "resumen", true, "mixed").deliveryLabel, "CONFIRMACIÓN MIXTA · ver cada pedido");
assert.match(matrix, /coverage\.status === "complete"\s*\? "border border-slate-400 bg-slate-50 text-slate-800"/);
assert.match(matrix, /verified\s*\? "border border-sky-700 bg-sky-50 text-sky-950"/);
assert.match(matrix, /presentation\.deliveryConfirmed\s*\? "border-emerald-700 bg-emerald-100 text-emerald-950"/);
console.log("PASS: cobertura, check operativo y entrega final se presentan como estados independientes");
